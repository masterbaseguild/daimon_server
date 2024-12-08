// imports

import dgram from 'dgram';
import readline from 'readline';
import zlib from 'zlib';
import fs from 'fs';

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
}

// logging

const log = (message: string) => {
    console.log(`> [SERVER] ${message}`);
}

const error = (message: string) => {
    console.error(`> [SERVER] ${message}`);
}

// region

const regionObjectToBuffer = (object: region) => {
    const headerBuffer = Buffer.alloc(256 * 6);
    for (let i = 0; i < 256; i++) {
        if (object.header[i] === undefined) headerBuffer.write(`000000000000`, i * 6, 6, `hex`);
        else headerBuffer.write(object.header[i], i * 6, 6, `hex`);
    }
    const dataBuffer = Buffer.alloc(16 * 16 * 16 * 16 * 16 * 16);
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            for (let k = 0; k < 16; k++) {
                for (let l = 0; l < 16; l++) {
                    for (let m = 0; m < 16; m++) {
                        for (let n = 0; n < 16; n++) {
                            dataBuffer.writeUInt8(object.data[i][j][k][l][m][n], i * 16 * 16 * 16 * 16 * 16 + j * 16 * 16 * 16 * 16 + k * 16 * 16 * 16 + l * 16 * 16 + m * 16 + n);
                        }
                    }
                }
            }
        }
    }

    const buffer = zlib.deflateSync(Buffer.concat([headerBuffer, dataBuffer]));
    log(`region compressed to ${buffer.length} bytes`);
    return buffer;
};

const SetBlock = (x: number, y: number, z: number, blockIndex: number, region: region) => {
    const regionX = Math.floor(x / 16);
    const regionY = Math.floor(y / 16);
    const regionZ = Math.floor(z / 16);
    const chunkX = x % 16;
    const chunkY = y % 16;
    const chunkZ = z % 16;
    region.data[regionX][regionY][regionZ][chunkX][chunkY][chunkZ] = blockIndex;
}

const generateSampleRegion = () => {
    const region: region = {
        header: [],
        data: []
    };

    // set sample header
    region.header.push(`000000000000`); // air
    region.header.push(`5655135ebc9c`); // tile
    region.header.push(`2f9e4658c3f0`); // glass

    // fill data with air
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

    // set sample blocks
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

//const region = generateSampleRegion();
//fs.writeFileSync(`region.json`, JSON.stringify(region));
const region = JSON.parse(fs.readFileSync(`region.json`, `utf8`));

// udp server

const port = 4000;
const connectedUsers: user[] = [];
const server = dgram.createSocket(`udp4`);

const packetBufferToObject = (buffer: Buffer) => {
    const elements: string[] = buffer.toString().split(`\t`);
    const type = elements.shift();
    const index = parseInt(elements.shift() || `-1`);
    const packet: packet = {
        type: type || ``,
        index: index,
        data: elements
    };
    return packet;
};

server.bind(port);

server.on(`error`, (err) => {
    error(`server error: ${err}`);
    server.close();
});

server.on(`message`, (buffer, rinfo) => {
    const packet: packet = packetBufferToObject(buffer);
    // user connects
    if(packet.type === `connect`){
        log(`${packet.data[0]} attempting to connect with client port ${rinfo.port}...`);
        const isAlreadyConnected = connectedUsers.find(user => user.username === packet.data[0]);
        if(isAlreadyConnected){
            log(`user already connected!`);
            // server sends conflict error
            server.send(`conflict`, rinfo.port, rinfo.address);
        }
        else
        {
            log(`connected!`);
            const user: user = {
                index: connectedUsers.length,
                address: rinfo.address,
                port: rinfo.port,
                username: packet.data[0],
                position: {
                    x: 0,
                    y: 0,
                    z: 0
                }
            };
            connectedUsers.push(user);
            // server confirms connection
            server.send(`confirmconnect\t${user.index}\t${connectedUsers.map(user => `${user.index}\t${user.username}`).join(`\t`)}`, rinfo.port, rinfo.address);
            connectedUsers.forEach(otherUser => {
                // server sends connected user signal to all connected users
                server.send(`userconnected\t${user.index}\t${user.username}`, otherUser.port, otherUser.address);
                // server sends chat message to all connected users
                server.send(`chatmessage\t${user.index}\t${user.username}\t${user.username} has connected`, otherUser.port, otherUser.address);
            });
        }
    }
    // user disconnects
    else if(packet.type === `disconnect`){
        const user = connectedUsers.find(user => user.index === packet.index);
        if(!user) return;
        log(`${user.username} has disconnected`);
        connectedUsers.splice(connectedUsers.indexOf(user), 1);
        connectedUsers.forEach(otherUser => {
            // server sends disconnected user signal to all connected users
            server.send(`userdisconnected\t${user.index}`, otherUser.port, otherUser.address);
            // server sends chat message to all connected users
            server.send(`chatmessage\t${user.index}\t${user.username}\t${user.username} has disconnected`, otherUser.port, otherUser.address);
        });
    }
    // user sends their position
    else if(packet.type === `position`){
        const user = connectedUsers.find(user => user.index === packet.index);
        if(!user) return;
        user.position.x = parseFloat(packet.data[0].replace(/,/g, `.`));
        user.position.y = parseFloat(packet.data[1].replace(/,/g, `.`));
        user.position.z = parseFloat(packet.data[2].replace(/,/g, `.`));
    }
    // user sends a chat message
    else if(packet.type === `chat`){
        const user = connectedUsers.find(user => user.index === packet.index);
        if(!user) return;
        connectedUsers.forEach(otherUser => {
            // server sends chat message to all connected users
            server.send(`chatmessage\t${user.index}\t${user.username}\t${packet.data[0]}`, otherUser.port, otherUser.address);
        });
    }
    // user requests a region
    else if(packet.type === `region`){
        log(`region request received`);
        // server sends region to user
        server.send(`confirmregion\t${regionObjectToBuffer(region).toString(`base64`)}`, rinfo.port, rinfo.address);
    }
});

server.on(`listening`, () =>{
    log(`server startup successful`);
});

// loop

const tickLength = 50; // ms

const loop = () => {
    connectedUsers.forEach(user => {
        // server sends all positions to all connected users
        server.send(`allpositions\t${connectedUsers.map(user => `${user.index}\t${user.position.x}\t${user.position.y}\t${user.position.z}`.replace(/\./g, `,`)).join(`\t`)}`, user.port, user.address);
    });
};

setInterval(() => {
    loop();
}, tickLength);

// command line interface

const forceDisconnect = (index: number) => {
    const user = connectedUsers.find(user => user.index === index);
    if(!user) return;
    // server sends forced disconnect signal to user
    server.send(`forcedisconnect`, user.port, user.address);
    connectedUsers.splice(connectedUsers.indexOf(user), 1);
};

const printNonAirBlocks = (region: region) => {
    interface internalDictionary {
        [key: string]: string
    }
    const blockNames: internalDictionary = {
        '000000000000': 'air',
        '5655135ebc9c': 'tile',
        '2f9e4658c3f0': 'glass'
    };
    const idToName = (id: string) => {
        return blockNames[id];
    };
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            for (let k = 0; k < 16; k++) {
                for (let l = 0; l < 16; l++) {
                    for (let m = 0; m < 16; m++) {
                        for (let n = 0; n < 16; n++) {
                            if(region.data[i][j][k][l][m][n] !== 0) log(`the block at coordinates x:${i*16+l} y:${j*16+m} z:${k*16+n} is ${idToName(region.header[region.data[i][j][k][l][m][n]])}`);
                        }
                    }
                }
            }
        }
    }
};

const printNonEmptyChunks = (region: region) => {
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            for (let k = 0; k < 16; k++) {
                let isEmpty = true;
                for (let l = 0; l < 16; l++) {
                    for (let m = 0; m < 16; m++) {
                        for (let n = 0; n < 16; n++) {
                            if(region.data[i][j][k][l][m][n] !== 0) isEmpty = false;
                        }
                    }
                }
                if(!isEmpty) log(`chunk at coordinates x:${i} y:${j} z:${k} is not empty`);
            }
        }
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on(`line`, (input) => {
    const args = input.split(` `);
    if(args[0] === `list`){
        log(`users:`);
        console.log(connectedUsers);
    }
    else if(args[0] === `kickall`){
        connectedUsers.forEach(user => {
            forceDisconnect(user.index);
        });
        log(`all users kicked`);
    }
    else if(args[0] === `kick`){
        const user = connectedUsers.find(user => user.index === parseInt(args[1]));
        if(!user) return;
        forceDisconnect(user.index);
        log(`${user.username} kicked`);
    }
    else if(args[0] === `exit`){
        rl.close();
    }
    else if(args[0] === `region`){
        log(`info about region:`);
        console.log(region);
    }
    else if(args[0] === `nonair`){
        log(`non air blocks:`);
        printNonAirBlocks(region);
    }
    else if(args[0] === `nonempty`){
        log(`non empty chunks:`);
        printNonEmptyChunks(region);
    }
    else if(args[0] === `clear`){
        console.clear();
    }
    else if(args[0] === `exit`){
        rl.close();
    }
    else{
        log(`command not found`);
    }
});

rl.on(`close`, () => {
    log(`server shutdown successful`);
    process.exit(0);
});

rl.prompt();