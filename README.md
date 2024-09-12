# Setup

1. Clone this repository
2. Install Node.js from https://nodejs.org
3. Install the dependencies with `npm install`
4. Run the application with `npm run dev`

# Data Structures

## User

- index

        the index of the user in the server (e.g. 5)
- address

        the IPv4 address of the user (e.g. 0.0.0.0)
- port

        the port of the user (e.g. 5000)
- username

        the username of the user (e.g. "user")
- position

        the position of the user (e.g. {x: 0, y: 0, z: 0})

## Packet

- type

        the type of the packet (e.g. "connect")
- index

        the index of the receiving user (e.g. 5)
- data

        the data of the packet (e.g. ["username"])

## Region

- header

        the array containing all the ids of the blocks that make up the region (e.g. [000000000000, 000000000001, ...])
- data
    
        a 3D array (the region) containing 3D arrays (the chunks) made up of integers. Each integer refers to an entry in the header array,
        and represents a block in the region (e.g. [[[0, 0, 0], [0, 0, 0], ...], [[0, 0, 0], [0, 0, 0], ...], ...])

# Packet Types

- packets are sent as strings of words
- every word is separated by a tab character
- the first word is the packet type
- the second word is (usually) the index of the user
- the following words are the packet data

## Sent by the client

- connect 0 username

        the user requests to connect to the server;
        since the user has not been assigned an index yet, it is set to 0
        (it won't be used by the server anyway)
- disconnect index

        the user disconnects from the server
- position index x y z

        the user notifies the server that they have moved
- chat index username message

        the user sends a chat message
- region

        the user requests the region from the server;
        since the index is not needed, it is omitted

## Sent by the server

- confirmconnect index [index username]

        the server confirms the connection of the user
- conflict

        the server notifies the user that the username is already in use;
        since the index is not needed, it is omitted
- userconnected index username

        the server notifies the user that another user has connected
- userdisconnected index

        the server notifies the user that another user has disconnected
- allpositions [index x y z]

        the server sends the positions of all users;
        since the index is not needed, it is omitted
        (that is, the index of the user receiving the packet)
- confirmregion region(base64)
    
        the server sends the region to the user, encoded in base64;
        since the index is not needed, it is omitted

# Components

- Logging
- Region Management
- UDP Server
- Game Loop
- Command Line Interface

# Todo

- [ ] wrap into classes the following:
    - [ ] region
    - [ ] user
    - [ ] packet
- [ ] implement the following cli functionalities:
    - [ ] history and navigation
    - [ ] tab completion
- [ ] implement packet validation (e.g. wrong packet type, missing data)
- [ ] implement packet authorization and authentication
- [ ] dockerize the application
- [ ] create an optimized packet protocol