// imports

import dgram from 'node:dgram';
import readline from 'node:readline';
import fs from 'fs';
import zlib from 'zlib';

// data types

declare global {
    interface user {
        index: number,
        address: string,
        port: number,
        username: string,
        position: {
            x: number,
            y: number,
            z: number
        }
    }
    interface packet {
        type: string,
        index: number,
        data: any
    }
    interface region {
        header: string[],
        data: number[][][][][][]
    }
    interface internalDictionary {
        [key: string]: string
    }
}

// data

const regionId = '000000000000'
const port = 4000;
const tickLength = 50;
const users: user[] = [];
var index = 0;
const blockNames: internalDictionary = {
    '000000000000': 'air',
    '000000000001': 'tile',
    '000000000002': 'glass'
};

const region: region = {
    header: [],
    data: []
};

const idToName = (id: string) => {
    return blockNames[id];
};

const s3Query = (path: string) => {
    const root = '../daimon_vault/bucket/';
    return new Promise((resolve) => {
        fs.readFile(root+path, (err, data) => {
            if (err) {
                console.log(err);
                resolve(null);
            } else {
                resolve(data);
            }
        }
    )});
};

const s3Create = (path: string, body: any) => {
    const root = '../daimon_vault/bucket/';
    return new Promise<boolean>((resolve) => {
        fs.writeFile(root+path, body, (err) => {
            if (err) {
                console.log(err);
                resolve(false);
            } else {
                resolve(true);
            }
        })
    });
};

const compressRegion = (region: region) => {
    const headerBuffer = Buffer.alloc(256 * 6);
    for (let i = 0; i < 256; i++) {
        if (region.header[i] === undefined) headerBuffer.write('000000000000', i * 6, 6, 'hex');
        else headerBuffer.write(region.header[i], i * 6, 6, 'hex');
    }
    const contentBuffer = Buffer.alloc(16 * 16 * 16 * 16 * 16 * 16);
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            for (let k = 0; k < 16; k++) {
                for (let l = 0; l < 16; l++) {
                    for (let m = 0; m < 16; m++) {
                        for (let n = 0; n < 16; n++) {
                            contentBuffer.writeUInt8(region.data[i][j][k][l][m][n], i * 16 * 16 * 16 * 16 * 16 + j * 16 * 16 * 16 * 16 + k * 16 * 16 * 16 + l * 16 * 16 + m * 16 + n);
                        }
                    }
                }
            }
        }
    }
    const buffer = Buffer.concat([headerBuffer, contentBuffer]);
    const compressedBuffer = zlib.deflateSync(buffer);
    console.log(`> [SERVER] region compressed to ${compressedBuffer.length} bytes`);
    return compressedBuffer;
};

const decompressRegion = (region: region, data: Buffer) => {
    const buffer = zlib.inflateSync(data);
    const headerBuffer = buffer.slice(0, 256 * 6);
    const contentBuffer = buffer.slice(256 * 6);
    for (let i = 0; i < 256; i++) {
        region.header.push(headerBuffer.toString('hex', i * 6, i * 6 + 6));
    }
    for (let i = 0; i < 16; i++) {
        region.data.push([]); //region x
        for (let j = 0; j < 16; j++) {
            region.data[i].push([]); //region y
            for (let k = 0; k < 16; k++) {
                region.data[i][j].push([]); //region z
                for (let l = 0; l < 16; l++) {
                    region.data[i][j][k].push([]); //chunk x
                    for (let m = 0; m < 16; m++) {
                        region.data[i][j][k][l].push([]); //chunk y
                        for (let n = 0; n < 16; n++) {
                            region.data[i][j][k][l][m].push(contentBuffer.readUInt8(i * 16 * 16 * 16 * 16 * 16 + j * 16 * 16 * 16 * 16 + k * 16 * 16 * 16 + l * 16 * 16 + m * 16 + n));
                        }
                    }
                }
            }
        }
    }
    console.log(`> [SERVER] region decompressed from ${data.length} bytes`);
    return region;
};


const generateEmptyRegion = () => {
    const region: region = {
        header: [],
        data: []
    };

    for (let i = 0; i < 16; i++) {
        region.data.push([]); //region x
        for (let j = 0; j < 16; j++) {
            region.data[i].push([]); //region y
            for (let k = 0; k < 16; k++) {
                region.data[i][j].push([]); //region z
                for (let l = 0; l < 16; l++) {
                    region.data[i][j][k].push([]); //chunk x
                    for (let m = 0; m < 16; m++) {
                        region.data[i][j][k][l].push([]); //chunk y
                        for (let n = 0; n < 16; n++) {
                            region.data[i][j][k][l][m].push(0); //chunk z
                        }
                    }
                }
            }
        }
    }
    // dummy data generation
    region.header.push('000000000000');
    region.header.push('000000000001');
    region.header.push('000000000002');
    SetBlock(100, 100, 100, 1, region);
    SetBlock(100, 100, 101, 2, region);
    SetBlock(101, 100, 100, 1, region);
    SetBlock(101, 100, 101, 2, region);
    SetBlock(100, 101, 100, 2, region);
    SetBlock(100, 101, 101, 1, region);
    SetBlock(101, 101, 100, 2, region);
    SetBlock(101, 101, 101, 1, region);

    return region;
};

const listNonAirBlocks = (region: region) => {
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            for (let k = 0; k < 16; k++) {
                for (let l = 0; l < 16; l++) {
                    for (let m = 0; m < 16; m++) {
                        for (let n = 0; n < 16; n++) {
                            if(region.data[i][j][k][l][m][n] !== 0) console.log(`> [SERVER] the block at coordinates x:${i*16+l} y:${j*16+m} z:${k*16+n} is ${idToName(region.header[region.data[i][j][k][l][m][n]])}`);
                        }
                    }
                }
            }
        }
    }
};

const SetBlock = (x: number, y: number, z: number, blockIndex: number, region: region) => {
    const regionX = Math.floor(x / 16);
    const regionY = Math.floor(y / 16);
    const regionZ = Math.floor(z / 16);
    const chunkX = x % 16;
    const chunkY = y % 16;
    const chunkZ = z % 16;
    region.data[regionX][regionY][regionZ][chunkX][chunkY][chunkZ] = blockIndex;
    return region;
}

//s3Query(`regions/${regionId}.mvr`).then((data: any) => {
    //if(!data) return;
    //decompressRegion(region, data);
    console.log('> [SERVER] region loaded');
//});

/* s3Create(`regions/${regionId}.mvr`, compressRegion(generateEmptyRegion())).then((success: boolean) => {
    if(success) console.log('> [SERVER] region created');
    else console.log('> [SERVER] region creation failed');
}); */

// udp server

const server = dgram.createSocket('udp4');

server.bind(port);

server.on('error', (err) => {
    console.log(err.stack);
    server.close();
});

server.on('message', (msg, rinfo) => {
    const packet: packet = parsePacket(msg);
    // need to implement permission check
    if(packet.type === 'connect'){
        console.log(`> [SERVER] ${packet.data[0]} attempting to connect...`);
        if(users.find(user => user.username === packet.data[0])){
            console.log(`> [SERVER] user already connected!`);
            server.send('conflict', rinfo.port, rinfo.address);
        }
        else
        {
            console.log(`> [SERVER] connected!`);
            const user: user = {
                index: users.length,
                address: rinfo.address,
                port: rinfo.port,
                username: packet.data[0],
                position: {
                    x: 0,
                    y: 0,
                    z: 0
                }
            };
            index++;
            users.push(user);
            server.send(`confirmconnect\t${user.index}\t${users.map(user => `${user.index}\t${user.username}`).join('\t')}`, rinfo.port, rinfo.address);
            users.forEach(otherUser => {
                server.send(`userconnected\t${user.index}\t${user.username}`, otherUser.port, otherUser.address);
                server.send(`chatmessage\t${user.index}\t${user.username}\t${user.username} has connected`, otherUser.port, otherUser.address);
            });
        }
    }
    else if(packet.type === 'disconnect'){
        const user = users.find(user => user.index === packet.index);
        if(!user) return;
        console.log(`> [SERVER] ${user.username} has disconnected`);
        users.splice(users.indexOf(user), 1);
        users.forEach(otherUser => {
            server.send(`userdisconnected\t${user.index}`, otherUser.port, otherUser.address);
            server.send(`chatmessage\t${user.index}\t${user.username}\t${user.username} has disconnected`, otherUser.port, otherUser.address);
        });
    }
    else if(packet.type === 'position'){
        const user = users.find(user => user.index === packet.index);
        if(!user) return;
        user.position.x = parseFloat(packet.data[0].replace(/,/g, '.'));
        user.position.y = parseFloat(packet.data[1].replace(/,/g, '.'));
        user.position.z = parseFloat(packet.data[2].replace(/,/g, '.'));
    }
    else if(packet.type === 'chat'){
        const user = users.find(user => user.index === packet.index);
        if(!user) return;
        users.forEach(otherUser => {
            server.send(`chatmessage\t${user.index}\t${user.username}\t${packet.data[0]}`, otherUser.port, otherUser.address);
        });
    }
    else if(packet.type === 'region'){
        server.send(`confirmregion\t${compressRegion(region).toString('base64')}`, rinfo.port, rinfo.address);
    }
});

server.on('listening', () =>{
    console.log('[SERVER] server startup successful');
});

const parsePacket = (msg: Buffer) => {
    // need to implement invalid packet check
    const elements: string[] = msg.toString().split('\t');
    const type = elements.shift();
    const index = parseInt(elements.shift() || '-1');
    const packet: packet = {
        type: type || '',
        index: index,
        data: elements
    };
    return packet;
};

// loop

setInterval(() => {
    loop();
}, tickLength);

const loop = () => {
    users.forEach(user => {
        server.send(`allpositions\t${users.map(user => `${user.index}\t${user.position.x}\t${user.position.y}\t${user.position.z}`.replace(/\./g, ',')).join('\t')}`, user.port, user.address);
    });
};

const forceDisconnect = (index: number) => {
    const user = users.find(user => user.index === index);
    if(!user) return;
    server.send(`forcedisconnect`, user.port, user.address);
    users.splice(users.indexOf(user), 1);
};

// command line interface

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', (input) => {
    const args = input.split(' ');
    if(args[0] === 'list'){
        console.log('> [SERVER] users:');
        console.log(users);
    }
    else if(args[0] === 'kickall'){
        users.splice(0, users.length);
        console.log('> [SERVER] all users kicked');
    }
    else if(args[0] === 'kick'){
        const user = users.find(user => user.index === parseInt(args[1]));
        if(!user) return;
        forceDisconnect(user.index);
        console.log(`> [SERVER] ${user.username} kicked`);
    }
    else if(args[0] === 'exit'){
        rl.close();
    }
    else if(args[0] === 'region'){
        console.log('> [SERVER] info about region:');
        console.log(region);
    }
    else if(args[0] === 'nonair'){
        console.log('> [SERVER] non air blocks:');
        listNonAirBlocks(region);
    }
    else{
        console.log('> [SERVER] command not found');
    }
});

rl.on('close', () => {
    console.log('> [SERVER] server shutdown successful');
    process.exit(0);
});

rl.prompt();

// current client packet types:

// - connect username
// - disconnect index
// - position index x y z
// - chat index username message
// - region

// current server packet types:

// - confirmconnect index [index username]
// - conflict
// - userconnected index username
// - userdisconnected index
// - allpositions [index x y z]
// - confirmregion region(base64)