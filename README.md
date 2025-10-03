# Daimon Server

Codebase del Daimon Server, sviluppato in NodeJS e liberamente deployabile.
Il Daimon Server fa parte del Daimon Engine, un game engine basato su Unity con voxel engine e multiplayer studiato per supportare user generated content.

## Features

- (Non incluso) convertitore da mappe Minecraft a mappe Daimon, basato su un dizionario personalizzabile per la traduzione dei blocchi
- Protocollo di pacchetti personalizzato ibrido, con supporto per UDP e TCP, e sistema di connessione a doppio handshake per entrambi i protocolli
- Console interattiva per amministrazione del server
- Supporto per due modalità: edit mode e play mode
- In edit mode, modifica libera della mappa da parte dei giocatori, e sistema di autosave e backup per la mappa di gioco
- (WIP) In play mode, blocco della modifica della mappa, e supporto per gamerules che regolano il gameplay loop
- Sistema di compressione personalizzato della mappa, per salvataggio su disco e per invio ai client
- Dizionario di blocchi basato su ID recuperati dinamicamente lato client da REST API hostata autonomamente (Daimon Backend), con seguente recupero di texture da bucket MinIO hostato autonomamente
- Gestione della posizione dei giocatori, con pacchetti di sincronizzazione
- Voxel engine a doppia griglia, con supporto per blocchi pieni e mezzi blocchi
- Sistema di mappe multiregione, per strutture di grandi dimensioni e di forma irregolare
- (WIP) Keepalive dei client, con kick automatico in caso di timeout

## Installazione

- Selezionare il branch "versary_demo"
- Clonare la repository tramite `git clone <repository-url>`
- Rinominare `.env.example` in `.env`
- Rinominare `world.example` in `world`
- Costruire l'immagine Docker tramite `docker build -t daimon_server .`
- Eseguire il container tramite `docker run -d --name daimon_server -p 7689:7689/udp -p 7689:7689 daimon_server`