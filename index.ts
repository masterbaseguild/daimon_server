// imports

import dgram from 'dgram';
import net from 'net';
import readline from 'readline';
import zlib from 'zlib';
import fs from 'fs';

// data types

const UDP_MAX_PACKET_SIZE = 512; // bytes

declare global {
    interface user {
        index: number,
        address: string,
        port: number,
        socket: net.Socket | null,
        username: string,
        position: {
            x: number,
            y: number,
            z: number
        },
        rotation: {
            x: number,
            y: number,
            z: number
        },
        camera: {
            x: number,
            y: number,
            z: number
        }
    }
    interface packet {
        type: number,
        index: number,
        data: any
    }
    interface region {
        header: string[],
        data: number[][][][][][]
    }
}

const Packet = {
    client:
    {
        CONNECT: 0,
        DISCONNECT: 1,
        WORLD: 2,
        NEWPOSITION: 3,
        KEEPALIVE: 4,
        CHAT: 5,
        USERCONNECT: 6,
        USERDISCONNECT: 7
    },
    server:
    {
        CONNECT: 0,
        DISCONNECT: 1,
        WORLD: 2,
        NEWPOSITION: 3,
        KEEPALIVE: 4,
        CHAT: 5
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

    const headerUint8Array = new Uint8Array(headerBuffer.buffer);
    const dataUint8Array = new Uint8Array(dataBuffer.buffer);

    const combinedArray = new Uint8Array(headerUint8Array.length + dataUint8Array.length);
    combinedArray.set(headerUint8Array);
    combinedArray.set(dataUint8Array, headerUint8Array.length);

    const buffer = zlib.deflateSync(combinedArray);

    log(`region compressed to ${buffer.length} bytes`);
    return buffer;
};

const regionBufferToObject = (buffer: Buffer) => {
    const decompressedBuffer = zlib.inflateSync(new Uint8Array(buffer));
    const headerBuffer = new Uint8Array(Buffer.alloc(256 * 6));
    const dataBuffer = new Uint8Array(Buffer.alloc(decompressedBuffer.length - headerBuffer.length));
    decompressedBuffer.copy(headerBuffer, 0, 0, headerBuffer.length);
    decompressedBuffer.copy(dataBuffer, 0, headerBuffer.length, dataBuffer.length);
    const header: string[] = [];
    for (let i = 0; i < 256; i++) {
        var headerLine = Array.from(headerBuffer.slice(i * 6, i * 6 + 6))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
        headerLine = headerLine.replace(/-/g, ``);
        headerLine = headerLine.toLowerCase();
        if (headerLine == "000000000000" && i != 0)
        {
            continue;
        }
        header.push(headerLine);
    }
    const data: number[][][][][][] = [];
    for (let i = 0; i < 16; i++) {
        data.push([]);
        for (let j = 0; j < 16; j++) {
            data[i].push([]);
            for (let k = 0; k < 16; k++) {
                data[i][j].push([]);
                for (let l = 0; l < 16; l++) {
                    data[i][j][k].push([]);
                    for (let m = 0; m < 16; m++) {
                        data[i][j][k][l].push([]);
                        for (let n = 0; n < 16; n++) {
                            data[i][j][k][l][m].push(dataBuffer[i * 16 * 16 * 16 * 16 * 16 + j * 16 * 16 * 16 * 16 + k * 16 * 16 * 16 + l * 16 * 16 + m * 16 + n]);
                        }
                    }
                }
            }
        }
    }
    const region: region = {
        header: header,
        data: data
    };
    return region;
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

// generate json region
//const region = generateSampleRegion();

// save to json
//fs.writeFileSync(`world/0.0.0.json`, JSON.stringify(region));

// load from json
//const region = JSON.parse(fs.readFileSync(`world/0.0.0.json`, `utf8`));

// save to dat
//fs.writeFileSync(`world/0.0.0.dat`, new Uint8Array(regionObjectToBuffer(region)));

// load from dat
//const region = regionBufferToObject(fs.readFileSync(`world/0.0.0.dat`));

// init world array
const world: {region: region, coordinates: {x: number, y: number, z: number}}[] = [];
var regionFiles = fs.readdirSync(`world`);
regionFiles.forEach(file => {
    if(file.endsWith(`.dat`)){
        const data = fs.readFileSync(`world/${file}`)
        const region = regionBufferToObject(data);
        const coordinates = file.split(`.`);
        const x = parseInt(coordinates[0]);
        const y = parseInt(coordinates[1]);
        const z = parseInt(coordinates[2]);
        world.push({
            region: region,
            coordinates: {
                x: x,
                y: y,
                z: z
            }
        });
        log(`loaded region ${file} at coordinates x:${x} y:${y} z:${z}`);
    }
});
const region = world[0].region;

// udp server

const port = 7689;
const connectedUsers: user[] = [];
const server = dgram.createSocket(`udp4`);
const tcpServer = net.createServer((socket: net.Socket) => {
    console.log('New TCP connection:', socket.remoteAddress, socket.remotePort);
    socket.on('data', (buffer) => {
        console.log('Received from client:', buffer.toString());
        const packet: packet = packetBufferToObject(buffer);
        if(packet.type === Packet.server.CONNECT){
            const user = connectedUsers.find(user => user.index === packet.index);
            if(!user) return;
            user.socket = socket;
            console.log(`User ${user.username} connected via TCP`);
            socket.write(`${69}`);
        }
    });
    socket.on('error', (err) => {
        console.error('Socket error:', err);
    });
    socket.on('end', () => {
        console.log('Client disconnected via TCP');
        socket.destroy();
    });
    socket.on('close', () => {
        console.log('Socket closed');
    });
});

const packetBufferToObject = (buffer: Buffer) => {
    const elements: string[] = buffer.toString().split(`\t`);
    const type = parseInt(elements.shift() || `-1`);
    const index = parseInt(elements.shift() || `-1`);
    const packet: packet = {
        type: type,
        index: index,
        data: elements
    };
    return packet;
};

const findLowestAvailableIndex = () => {
    var sortedConnectedUsers = connectedUsers;
    sortedConnectedUsers.sort((a, b) => a.index - b.index);
    for (let i = 1; i < sortedConnectedUsers.length; i++) {
        if (sortedConnectedUsers[i].index - sortedConnectedUsers[i - 1].index > 1) {
            return sortedConnectedUsers[i - 1].index + 1;
        }
    }
    return sortedConnectedUsers.length;
};

server.bind(port);
tcpServer.listen(port);

server.on(`error`, (err) => {
    error(`server error: ${err}`);
    server.close();
});

server.on(`message`, (buffer, rinfo) => {
    const packet: packet = packetBufferToObject(buffer);
    // user connects
    if(packet.type === Packet.server.CONNECT){
        log(`${packet.data[0]} attempting to connect with client port ${rinfo.port}...`);
        const isAlreadyConnected = connectedUsers.find(user => user.username === packet.data[0]);
        if(isAlreadyConnected){
            log(`user already connected!`);
            // server sends conflict error
            server.send(`${Packet.client.DISCONNECT}`, rinfo.port, rinfo.address);
        }
        else
        {
            log(`connected!`);
            const user: user = {
                index: findLowestAvailableIndex(),
                address: rinfo.address,
                port: rinfo.port,
                socket: null,
                username: packet.data[0],
                position: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                rotation: {
                    x: 0,
                    y: 0,
                    z: 0
                },
                camera: {
                    x: 0,
                    y: 0,
                    z: 0
                }
            };
            connectedUsers.push(user);
            // server confirms connection
            server.send(`${Packet.client.CONNECT}\t${user.index}\t${connectedUsers.map(user => `${user.index}\t${user.username}`).join(`\t`)}`, rinfo.port, rinfo.address);
            connectedUsers.forEach(otherUser => {
                // server sends connected user signal to all connected users
                server.send(`${Packet.client.USERCONNECT}\t${user.index}\t${user.username}`, otherUser.port, otherUser.address);
                // server sends chat message to all connected users
                server.send(`${Packet.client.CHAT}\t${user.index}\t${user.username}\t${user.username} has connected`, otherUser.port, otherUser.address);
            });
        }
    }
    // user disconnects
    else if(packet.type === Packet.server.DISCONNECT){
        const user = connectedUsers.find(user => user.index === packet.index);
        if(!user) return;
        log(`${user.username} has disconnected`);
        connectedUsers.splice(connectedUsers.indexOf(user), 1);
        connectedUsers.forEach(otherUser => {
            // server sends disconnected user signal to all connected users
            server.send(`${Packet.client.USERDISCONNECT}\t${user.index}`, otherUser.port, otherUser.address);
            // server sends chat message to all connected users
            server.send(`${Packet.client.CHAT}\t${user.index}\t${user.username}\t${user.username} has disconnected`, otherUser.port, otherUser.address);
        });
    }
    // user sends their position
    else if(packet.type === Packet.server.NEWPOSITION){
        const user = connectedUsers.find(user => user.index === packet.index);
        if(!user) return;
        user.position.x = parseFloat(packet.data[0].replace(/,/g, `.`));
        user.position.y = parseFloat(packet.data[1].replace(/,/g, `.`));
        user.position.z = parseFloat(packet.data[2].replace(/,/g, `.`));
        user.rotation.x = parseFloat(packet.data[3].replace(/,/g, `.`));
        user.rotation.y = parseFloat(packet.data[4].replace(/,/g, `.`));
        user.rotation.z = parseFloat(packet.data[5].replace(/,/g, `.`));
        user.camera.x = parseFloat(packet.data[6].replace(/,/g, `.`));
    }
    // user sends a chat message
    else if(packet.type === Packet.server.CHAT){
        const user = connectedUsers.find(user => user.index === packet.index);
        if(!user) return;
        connectedUsers.forEach(otherUser => {
            // server sends chat message to all connected users
            server.send(`${Packet.client.CHAT}\t${user.index}\t${user.username}\t${packet.data[0]}`, otherUser.port, otherUser.address);
        });
    }
    // user requests a region
    else if(packet.type === Packet.server.WORLD){
        log(`region request received`);
        // server sends region to user
        server.send(`${Packet.client.WORLD}\t${regionObjectToBuffer(region).toString(`base64`)}`, rinfo.port, rinfo.address);
    }
});

server.on(`listening`, () =>{
    log(`server startup successful`);
});

// loop

const tickLength = 20; // ms

const loop = () => {
    connectedUsers.forEach(user => {
        // server sends all positions to all connected users
        server.send(`${Packet.client.NEWPOSITION}\t${connectedUsers.map(user => `${user.index}\t${user.position.x}\t${user.position.y}\t${user.position.z}\t${user.rotation.x}\t${user.rotation.y}\t${user.rotation.z}\t${user.camera.x}`.replace(/\./g, `,`)).join(`\t`)}`, user.port, user.address);
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
    server.send(`${Packet.client.DISCONNECT}`, user.port, user.address);
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

if(false){
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
        else if(args[0] === `header`){
            log(`info about header:`);
            console.log(region.header);
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
}