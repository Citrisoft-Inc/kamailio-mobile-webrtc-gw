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
import jwt from 'jsonwebtoken';

const app = express();

app.post('/push-ios', async (req: Request, res: Response): Promise<void> => {
    const   CONST_ISSUER_ID: string = '59BC3BK9DX', 
            CONST_KEY_ID: string = 'S5465828J9',
            PUSH_URL_BASE = 'https://api.push.apple.com',
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

    const client = http2.connect(PUSH_URL_BASE);

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

    console.log(`Sending push notification to ${PUSH_URL_BASE}/${PUSH_URL_PATH}/${obj.push_tok}`);

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

    apnsReq.write(JSON.stringify({
        callId: obj.call_id,
        from: obj.sip_from_uri,
        sendTime: obj.send_time
    }), 'utf8');

    apnsReq.end();

    console.log(JSON.stringify({
        callId: obj.call_id,
        from: obj.sip_from_uri,
        sendTime: obj.send_time
    }, null, 2));

    res.status(200).send({"disposition": "OK"});
});

app.listen(80);