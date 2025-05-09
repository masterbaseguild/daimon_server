// imports

import * as dgram from 'dgram';
import * as net from 'net';
import * as readline from 'readline';
import * as zlib from 'zlib';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({path: `./.env`});

// data types

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
        },
        lastkeepalivetimestamp: number,
        hasChangedPosition: boolean
    }
    interface packet {
        type: number,
        index: number,
        data: any
    }
    interface region {
        header: string[],
        data: number[][][][][][],
        miniData: number[][][][][][]
    }
}

const currentMode = "edit"; // edit or play

const Packet = {
    client:
    {
        CONNECT: 0,
        DISCONNECT: 1,
        WORLD: 2,
        NEWPOSITION: 3,
        KEEPALIVE: 4,
        CHAT: 5,
        SETBLOCK: 6,
        SETMINIBLOCK: 7,
        SCRIPT: 8,
        USERCONNECT: 9,
        USERDISCONNECT: 10
    },
    server:
    {
        CONNECT: 0,
        DISCONNECT: 1,
        WORLD: 2,
        NEWPOSITION: 3,
        KEEPALIVE: 4,
        CHAT: 5,
        SETBLOCK: 6,
        SETMINIBLOCK: 7,
        SCRIPT: 8
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
    const headerSize = object.header.length;
    const headerLengthBuffer = Buffer.alloc(4);
    headerLengthBuffer.writeInt32LE(headerSize, 0);

    let byteWidth: 1 | 2 | 4;
    if (headerSize <= 0xFF) byteWidth = 1;
    else if (headerSize <= 0xFFFF) byteWidth = 2;
    else byteWidth = 4;

    const headerBuffer = Buffer.alloc(6 * headerSize);
    for (let i = 0; i < headerSize; i++) {
        headerBuffer.write(object.header[i] ?? '000000000000', i * 6, 6, 'hex');
    }

    const totalBlocks = 16 ** 6;
    const totalMiniBlocks = 16 ** 6 * 8;
    const dataBuffer = Buffer.alloc(totalBlocks * byteWidth + totalMiniBlocks * byteWidth);

    let offset = 0;
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            for (let k = 0; k < 16; k++) {
                for (let l = 0; l < 16; l++) {
                    for (let m = 0; m < 16; m++) {
                        for (let n = 0; n < 16; n++) {
                            const value = object.data[i][j][k][l][m][n];
                            if (byteWidth === 1) dataBuffer.writeUInt8(value, offset);
                            else if (byteWidth === 2) dataBuffer.writeUInt16LE(value, offset);
                            else dataBuffer.writeUInt32LE(value, offset);
                            offset += byteWidth;
                        }
                    }
                }
            }
        }
    }

    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            for (let k = 0; k < 16; k++) {
                for (let l = 0; l < 32; l++) {
                    for (let m = 0; m < 32; m++) {
                        for (let n = 0; n < 32; n++) {
                            const value = object.miniData[i][j][k][l][m][n];
                            if (byteWidth === 1) dataBuffer.writeUInt8(value, offset);
                            else if (byteWidth === 2) dataBuffer.writeUInt16LE(value, offset);
                            else dataBuffer.writeUInt32LE(value, offset);
                            offset += byteWidth;
                        }
                    }
                }
            }
        }
    }

    const fullBuffer = Buffer.concat([headerLengthBuffer, headerBuffer, dataBuffer]);
    const compressed = zlib.deflateSync(fullBuffer);

    return compressed;
};

const regionBufferToObject = (buffer: Buffer) => {
    const decompressedBuffer = zlib.inflateSync(new Uint8Array(buffer));

    const headerSize = decompressedBuffer.readInt32LE(0);

    let byteWidth: 1 | 2 | 4;
    if (headerSize <= 0xFF) byteWidth = 1;
    else if (headerSize <= 0xFFFF) byteWidth = 2;
    else byteWidth = 4;

    const header: string[] = [];
    const headerStart = 4;
    const headerEnd = headerStart + headerSize * 6;

    for (let i = 0; i < headerSize; i++) {
        const slice = decompressedBuffer.subarray(headerStart + i * 6, headerStart + (i + 1) * 6);
        let hex = [...slice].map(b => b.toString(16).padStart(2, '0')).join('').toLowerCase();
        if (hex === "000000000000" && i !== 0) continue;
        header.push(hex);
    }

    const dataStart = headerEnd;
    const data: number[][][][][][] = [];

    let offset = dataStart;

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
                            let value: number;
                            if (byteWidth === 1) {
                                value = decompressedBuffer.readUInt8(offset);
                            } else if (byteWidth === 2) {
                                value = decompressedBuffer.readUInt16LE(offset);
                            } else {
                                value = decompressedBuffer.readUInt32LE(offset);
                            }
                            data[i][j][k][l][m].push(value);
                            offset += byteWidth;
                        }
                    }
                }
            }
        }
    }

    const miniData: number[][][][][][] = [];

    for (let i = 0; i < 16; i++) {
        miniData.push([]);
        for (let j = 0; j < 16; j++) {
            miniData[i].push([]);
            for (let k = 0; k < 16; k++) {
                miniData[i][j].push([]);
                for (let l = 0; l < 32; l++) {
                    miniData[i][j][k].push([]);
                    for (let m = 0; m < 32; m++) {
                        miniData[i][j][k][l].push([]);
                        for (let n = 0; n < 32; n++) {
                            let value: number;
                            if (byteWidth === 1) {
                                value = decompressedBuffer.readUInt8(offset);
                            } else if (byteWidth === 2) {
                                value = decompressedBuffer.readUInt16LE(offset);
                            } else {
                                value = decompressedBuffer.readUInt32LE(offset);
                            }
                            miniData[i][j][k][l][m].push(value);
                            offset += byteWidth;
                        }
                    }
                }
            }
        }
    }

    const region: region = {
        header: header,
        data: data,
        miniData: miniData
    };
    return region;
};

const SetBlock = (x: number, y: number, z: number, blockIndex: number) => {
    const chunkX = Math.floor(x / 16);
    const chunkY = Math.floor(y / 16);
    const chunkZ = Math.floor(z / 16);
    const regionX = Math.floor(chunkX / 16);
    const regionY = Math.floor(chunkY / 16);
    const regionZ = Math.floor(chunkZ / 16);
    const region = world.find(region => region.coordinates.x === regionX && region.coordinates.y === regionY && region.coordinates.z === regionZ)?.region;

    if(!region) {
        console.error(`Block coordinates out of bounds! ${x}, ${y}, ${z}`);
        return;
    }

    const blockId = data.blocks[blockIndex];
    if(blockId === undefined) {
        console.error(`Block index out of bounds! ${blockIndex}`);
        return;
    }

    // find blockId in region header
    var blockIdIndex = region.header.findIndex(id => id === blockId);
    if(blockIdIndex === -1) {
        // add blockId to region header
        blockIdIndex = region.header.length;
        region.header.push(blockId);
    }

    const voxelX = x % 16;
    const voxelY = y % 16;
    const voxelZ = z % 16;
    region.data[chunkX%16][chunkY%16][chunkZ%16][voxelX][voxelY][voxelZ] = blockIdIndex;
}

const SetMiniBlock = (x: number, y: number, z: number, blockIndex: number) => {
    const chunkX = Math.floor(x / 32);
    const chunkY = Math.floor(y / 32);
    const chunkZ = Math.floor(z / 32);
    const regionX = Math.floor(chunkX / 16);
    const regionY = Math.floor(chunkY / 16);
    const regionZ = Math.floor(chunkZ / 16);
    const region = world.find(region => region.coordinates.x === regionX && region.coordinates.y === regionY && region.coordinates.z === regionZ)?.region;

    if(!region) {
        console.error(`Block coordinates out of bounds! ${x}, ${y}, ${z}`);
        return;
    }

    const blockId = data.blocks[blockIndex];
    if(blockId === undefined) {
        console.error(`Block index out of bounds! ${blockIndex}`);
        return;
    }

    // find blockId in region header
    var blockIdIndex = region.header.findIndex(id => id === blockId);
    if(blockIdIndex === -1) {
        // add blockId to region header
        blockIdIndex = region.header.length;
        region.header.push(blockId);
    }

    const voxelX = x % 32;
    const voxelY = y % 32;
    const voxelZ = z % 32;
    region.miniData[chunkX%16][chunkY%16][chunkZ%16][voxelX][voxelY][voxelZ] = blockIdIndex;
}

const generateSampleRegion = () => {
    const region: region = {
        header: [],
        data: [],
        miniData: []
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

    // fill miniData with air
    for (let i = 0; i < 16; i++) {
        region.miniData.push([]); //region x
        for (let j = 0; j < 16; j++) {
            region.miniData[i].push([]); //region y
            for (let k = 0; k < 16; k++) {
                region.miniData[i][j].push([]); //region z
                for (let l = 0; l < 32; l++) {
                    region.miniData[i][j][k].push([]); //chunk x
                    for (let m = 0; m < 32; m++) {
                        region.miniData[i][j][k][l].push([]); //chunk y
                        for (let n = 0; n < 32; n++) {
                            region.miniData[i][j][k][l][m].push(0); //chunk z
                        }
                    }
                }
            }
        }
    }

    // set sample blocks
    SetBlock(100, 100, 100, 1);
    SetBlock(100, 100, 101, 2);
    SetBlock(101, 100, 100, 1);
    SetBlock(101, 100, 101, 2);
    SetBlock(100, 101, 100, 2);
    SetBlock(100, 101, 101, 1);
    SetBlock(101, 101, 100, 2);
    SetBlock(101, 101, 101, 1);

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
const data = JSON.parse(fs.readFileSync(`world/data.json`, `utf8`));

// udp server

const port = 7689;
const connectedUsers: user[] = [];
const server = dgram.createSocket(`udp4`);
const tcpServer = net.createServer((socket: net.Socket) => {
    socket.on('data', (buffer) => {
        const packet: packet = packetBufferToObject(buffer);
        if(packet.type === Packet.server.CONNECT){
            const user = connectedUsers.find(user => user.index === packet.index);
            if(!user) return;
            log(`${user.username} connected via TCP!`);
            user.socket = socket;

            var dataBuffer;
            if(currentMode === "edit")
            {
                // set databuffer to the data.blocks array
                dataBuffer = `${data.blocks.join(`\t`)}`;
            }
            else
            {
                dataBuffer = `${0}`;
            }

            const typeBuffer = Buffer.alloc(2);
            typeBuffer.writeInt16LE(Packet.client.CONNECT, 0);

            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeInt32LE(dataBuffer.length, 0);

            socket.write(new Uint8Array(lengthBuffer));
            socket.write(new Uint8Array(typeBuffer));
            socket.write(dataBuffer);
        }
        // user requests a region
        else if(packet.type === Packet.server.WORLD){
            log(`${connectedUsers.find(user => user.socket === socket)?.username} requested world data`);

            const dataBuffer = `${world.map(region => `${region.coordinates.x}\t${region.coordinates.y}\t${region.coordinates.z}\t${regionObjectToBuffer(region.region).toString(`base64`)}`).join(`\t`)}`;

            const typeBuffer = Buffer.alloc(2);
            typeBuffer.writeInt16LE(Packet.client.WORLD, 0);

            const lengthBuffer = Buffer.alloc(4);
            lengthBuffer.writeInt32LE(dataBuffer.length, 0);

            socket.write(new Uint8Array(lengthBuffer));
            socket.write(new Uint8Array(typeBuffer));
            socket.write(dataBuffer);
        }
        // user sets a block
        else if(packet.type === Packet.server.SETBLOCK && currentMode === "edit"){
            const user = connectedUsers.find(user => user.socket === socket);
            if(!user) return;
            log(`${user.username} set block at coordinates x:${packet.data[0]} y:${packet.data[1]} z:${packet.data[2]}`);
            SetBlock(parseInt(packet.data[0]), parseInt(packet.data[1]), parseInt(packet.data[2]), parseInt(packet.data[3]));
            // server sends block set to all connected users
            connectedUsers.forEach(otherUser => {
                const dataBuffer = `${packet.data[0]}\t${packet.data[1]}\t${packet.data[2]}\t${packet.data[3]}`;

                const typeBuffer = Buffer.alloc(2);
                typeBuffer.writeInt16LE(Packet.client.SETBLOCK, 0);

                const lengthBuffer = Buffer.alloc(4);
                lengthBuffer.writeInt32LE(dataBuffer.length, 0);

                otherUser.socket?.write(new Uint8Array(lengthBuffer));
                otherUser.socket?.write(new Uint8Array(typeBuffer));
                otherUser.socket?.write(dataBuffer);
            });
        }
        // user sets a mini block
        else if(packet.type === Packet.server.SETMINIBLOCK && currentMode === "edit"){
            const user = connectedUsers.find(user => user.socket === socket);
            if(!user) return;
            log(`${user.username} set mini block at coordinates x:${packet.data[0]} y:${packet.data[1]} z:${packet.data[2]}`);
            SetMiniBlock(parseInt(packet.data[0]), parseInt(packet.data[1]), parseInt(packet.data[2]), parseInt(packet.data[3]));
            // server sends block set to all connected users
            connectedUsers.forEach(otherUser => {
                const dataBuffer = `${packet.data[0]}\t${packet.data[1]}\t${packet.data[2]}\t${packet.data[3]}`;

                const typeBuffer = Buffer.alloc(2);
                typeBuffer.writeInt16LE(Packet.client.SETMINIBLOCK, 0);

                const lengthBuffer = Buffer.alloc(4);
                lengthBuffer.writeInt32LE(dataBuffer.length, 0);

                otherUser.socket?.write(new Uint8Array(lengthBuffer));
                otherUser.socket?.write(new Uint8Array(typeBuffer));
                otherUser.socket?.write(dataBuffer);
            });
        }
    });
    socket.on('error', (err) => {
        console.log(err);
        socket.destroy();
    });
    socket.on('end', () => {
        socket.destroy();
    });
    socket.on('close', () => {
        socket.destroy();
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
tcpServer.listen(port, () => {
    log(`TCP server startup successful`);
});

server.on(`error`, (err) => {
    error(`UDP server error: ${err}`);
    server.close();
});

server.on(`message`, (buffer, rinfo) => {
    const packet: packet = packetBufferToObject(buffer);
    // user connects
    if(packet.type === Packet.server.CONNECT){
        log(`${packet.data[0]} attempting to connect via UDP with client port ${rinfo.port}...`);
        const isAlreadyConnected = connectedUsers.find(user => user.username === packet.data[0]);
        if(isAlreadyConnected){
            log(`${packet.data[0]} is already connected!`);
            // server sends conflict error
            server.send(`${Packet.client.DISCONNECT}`, rinfo.port, rinfo.address);
        }
        else
        {
            log(`${packet.data[0]} connected via UDP!`);
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
                },
                lastkeepalivetimestamp: Date.now(),
                hasChangedPosition: false
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
        log(`${user.username} has disconnected via UDP`);
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
        user.hasChangedPosition = true;
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
    // user sends a keepalive
    else if(packet.type === Packet.server.KEEPALIVE){
        const user = connectedUsers.find(user => user.index === packet.index);
        if(!user) return;
        user.lastkeepalivetimestamp = Date.now();
    }
    else if(packet.type === Packet.server.SCRIPT){
        const user = connectedUsers.find(user => user.index === packet.index);
        if(!user) return;
        log(`${user.username} sent a script channel message: ${packet.data[0]}`);
        // WIP: process the content of the script channel message via lua interpreter
    }
});

server.on(`listening`, () =>{
    log(`UDP server startup successful`);
});

const sendScriptMessage = (userIndex: number, message: string) => {
    const user = connectedUsers.find(user => user.index === userIndex);
    if(!user) return;
    server.send(`${Packet.client.SCRIPT}\t${user.index}`, user.port, user.address);
}

// loop

const tickLength = 20; // ms

const loop = () => {
    connectedUsers.forEach(user => {
        // server sends all positions to all connected users
        const packet = `${Packet.client.NEWPOSITION}${connectedUsers.map((user) => {
            if(user.hasChangedPosition) {
                user.hasChangedPosition = false;
                return `\t${user.index}\t${user.position.x}\t${user.position.y}\t${user.position.z}\t${user.rotation.x}\t${user.rotation.y}\t${user.rotation.z}\t${user.camera.x}`
            }
            else {
                return ""
            }
        })}`;
        if(packet.length > 1) {
            server.send(packet, user.port, user.address);
        }
    });
};

const keepalivegraceperiod = 300000; // ms
const keepalivetickrate = 6000; // ms

const sendKeepAlive = () => {
    connectedUsers.forEach(user => {
        if(user.lastkeepalivetimestamp + keepalivegraceperiod < Date.now())
        {
            log(`${user.username} has timed out`);
            server.send(`${Packet.client.DISCONNECT}`, user.port, user.address);
            user.socket?.destroy();
            connectedUsers.splice(connectedUsers.indexOf(user), 1);
            connectedUsers.forEach(otherUser => {
                // server sends disconnected user signal to all connected users
                server.send(`${Packet.client.USERDISCONNECT}\t${user.index}`, otherUser.port, otherUser.address);
                // server sends chat message to all connected users
                server.send(`${Packet.client.CHAT}\t${user.index}\t${user.username}\t${user.username} has disconnected`, otherUser.port, otherUser.address);
            });
        }
        else
        {
            server.send(`${Packet.client.KEEPALIVE}`, user.port, user.address);
        }
    });
};

setInterval(() => {
    loop();
}, tickLength);

setInterval(() => {
    sendKeepAlive();
}, keepalivetickrate);

// command line interface

const forceDisconnect = (index: number) => {
    const user = connectedUsers.find(user => user.index === index);
    if(!user) return;
    // server sends forced disconnect signal to user
    server.send(`${Packet.client.DISCONNECT}`, user.port, user.address);
    user.socket?.destroy();
    connectedUsers.splice(connectedUsers.indexOf(user), 1);
    connectedUsers.forEach(otherUser => {
        // server sends disconnected user signal to all connected users
        server.send(`${Packet.client.USERDISCONNECT}\t${user.index}`, otherUser.port, otherUser.address);
        // server sends chat message to all connected users
        server.send(`${Packet.client.CHAT}\t${user.index}\t${user.username}\t${user.username} has disconnected`, otherUser.port, otherUser.address);
    });
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

if(process.env.INTERACTIVE){
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
        else if(args[0] === `region`){
            const regionIndex = parseInt(args[1]);
            log(`info about region:`);
            console.log(world[regionIndex]);
        }
        else if(args[0] === `header`){
            const regionIndex = parseInt(args[1]);
            log(`info about header:`);
            console.log(world[regionIndex].region.header);
        }
        else if(args[0] === `headeradd`){
            const regionIndex = parseInt(args[1]);
            const blockId = args[1];
            world[regionIndex].region.header.push(blockId);
            log(`added block id ${blockId} to header`);
        }
        else if(args[0] === `nonair`){
            const regionIndex = parseInt(args[1]);
            log(`non air blocks:`);
            printNonAirBlocks(world[regionIndex].region);
        }
        else if(args[0] === `nonempty`){
            const regionIndex = parseInt(args[1]);
            log(`non empty chunks:`);
            printNonEmptyChunks(world[regionIndex].region);
        }
        else if(args[0] === `save`){
            world.forEach((region, index) => {
                fs.writeFileSync(`world/${region.coordinates.x}.${region.coordinates.y}.${region.coordinates.z}.dat`, new Uint8Array(regionObjectToBuffer(region.region)));
                log(`saved region ${region.coordinates.x}.${region.coordinates.y}.${region.coordinates.z}.dat`);
            });
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