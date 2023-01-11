//
// Demonstration/testing push notification stubs, harnessed into Express 4.x
//
// Evariste Systems LLC
// Author: Alex Balashov <abalashov@evaristesys.com>
//

'use strict';

import express, { Request, Response } from 'express';
import { default as assert } from 'node:assert';
import fs from 'node:fs';
import http2 from 'node:http2';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const app = express();

app.post('/push-apns', async (req: Request, res: Response): Promise<void> => {
    const   CONST_ISSUER_ID: string = '59BC3BK9DX', 
            CONST_KEY_ID: string = 'S5465828J9',
            PUSH_URL_BASE = 'https://api.push.apple.com',
            PUSH_URL_BASE_SANDBOX = 'https://api.sandbox.push.apple.com',
            PUSH_URL_PATH = '/3/device',
            PRIV_KEY_PATH: string = 'AuthKey_S5465828J9.p8';

    const objData: string = await new Promise((resolve, reject) => {
        let buf = '';
        req.on('data', (chunk: Buffer) => buf += chunk.toString());
        req.on('end', (): void => resolve(buf));
    });

    const privKey: Buffer = fs.readFileSync(PRIV_KEY_PATH);

    const jwtSecret: string = jwt.sign({}, privKey.toString(), {
        algorithm: 'ES256',
        issuer: CONST_ISSUER_ID,
        expiresIn: '1h',
        header: {
            alg: 'ES256',
            kid: CONST_KEY_ID
        }
    });

    let obj: {
        call_id?: string,
        push_tok?: string,
        sip_from_uri: string,
        sip_from_display?: string,
        send_time?: number
    } = {sip_from_uri: 'sip:anonymous@localhost.localdomain'};

    try {
        obj = JSON.parse(objData);
        assert.ok(obj.push_tok !== undefined);
        console.log(`Received data: ${JSON.stringify(obj, null, 2)}`);
    } catch(e: any) {
        res.status(500).send({error: e.toString()});
        console.error(e.toString());
        return;
    }

    console.log('Got VoIP token: ' + obj.push_tok);

    const client = http2.connect(req.query.provider === 'apns.dev' ? PUSH_URL_BASE_SANDBOX : PUSH_URL_BASE);

    client.on('error', (e: Error) => {
        console.error(`Client formation error: ${e.toString()}`);
        res.status(500).send({error: `Client formation error - ${e.toString()}`});
        return;
    });

    const apnsReq: http2.ClientHttp2Stream = client.request({
        'Content-Type': 'application/json',
        'apns-push-type': 'voip',
        'apns-expiration': '0',
        'apns-priority': '10',
        'apns-topic': 'com.citrisoft.softphone.voip',
        'Authorization': `Bearer ${jwtSecret}`,
        ':method': 'POST',
        ':path': `${PUSH_URL_PATH}/${obj.push_tok}`,
        ':scheme': 'https'
    });

    console.log(`Sending push notification to ${PUSH_URL_BASE}/${PUSH_URL_PATH}/${obj.push_tok} (${req.query.provider})`);

    apnsReq.setEncoding('utf8');

    apnsReq.on('response', (headers: http2.IncomingHttpHeaders[], flags: number): void => {
        for(const h in headers) {
            console.log(`${h.toString()}: ${headers[h]}`);
        }
    });

    let responseBuf: string = '';

    apnsReq.on('data', (chunk: Buffer): string => responseBuf += chunk.toString());

    apnsReq.on('end', (): void => {
        client.close();
        console.log(responseBuf);
    });

    const m = obj.sip_from_uri.match(/^sip\:([0-9^@]+)@/);
    let cid = '0000000000';

    if(m && m.length == 2)
        cid = m[1]; 

    const dataPayload = {
        aps: {
            "call-id": obj.call_id,
            callId: obj.call_id,
            from: obj.sip_from_uri,
            sendTime: obj.send_time,
            
            alert: { 	
                incoming_caller_id: cid,
                incoming_caller_name: obj.sip_from_display,
                uuid: crypto.randomUUID().toString()
            }
        },
        "call-id": obj.call_id,
        callId: obj.call_id
    };

    apnsReq.write(JSON.stringify(dataPayload), 'utf8');
    apnsReq.end();

    console.log(JSON.stringify(dataPayload, null, 2));

    res.status(200).send({"disposition": "OK"});
});

// FCM (Google Firebase Cloud Messaging) push API hook for Android.

app.post('/push-fcm', async (req: Request, res: Response): Promise<void> => {
    console.log('Doing FCM push');

    const SERVER_KEY = 'AAAAxwmjNls:APA91bGMT3k55vrb8GQsGDw7cDroW7R0dZnxUsP-rcKafBW7nUqtDj_GGwlh4tEGZvOKOUisSdGtznojpZJErd5VI50e19ZQyPsHxWM2Jmmw_Wtv6uu8TFq8IkzZXYDwBx1eWucSCUd1';

    const objData: string = await new Promise((resolve, reject) => {
        let buf = '';
        req.on('data', (chunk: Buffer) => buf += chunk.toString());
        req.on('end', (): void => resolve(buf));
    });

    let obj: {
        call_id?: string,
        push_tok?: string,
        sip_from_uri?: string,
        sip_from_display?: string,
        send_time?: number
    } = {};

    try {
        obj = JSON.parse(objData);
        assert.ok(obj.push_tok !== undefined);
        console.log(`Received data: ${JSON.stringify(obj, null, 2)}`);
    } catch(e: any) {
        res.status(500).send({error: e.toString()});
        console.error(e.toString());
        return;
    }

    console.log('Got VoIP token: ' + obj.push_tok);

    const fcmReq: http.ClientRequest = https.request({
        host: 'fcm.googleapis.com',
        port: 443,
        path: '/fcm/send',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${SERVER_KEY}`
        }
    }, (res: http.IncomingMessage) => {
        console.log(`Received response: ${res.statusCode}`);
        console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}`);
        
        res.on('data', (d: Buffer) => {
            process.stdout.write(d);
        });
    });

    fcmReq.end(JSON.stringify({
        time_to_live: 60,
        priority: 'high',
        registration_ids: [obj.push_tok]
    })); 

    console.log(JSON.stringify({
        time_to_live: 60,
        priority: 'high',
        registration_ids: [obj.push_tok],
        data: {
            uuid: crypto.randomUUID().toString(),
            'from-uri': 'sip:7066084910@38.101.40.11',
            'display-name': 'EVARISTE SYSTEMS',
            'call-id': obj.call_id
        }
    }, null, 2));

    console.log(`Sending Authorization: key=${SERVER_KEY}`);

    res.status(200).send({"disposition": "OK"});
});

app.listen(8084);
