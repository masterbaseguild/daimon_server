#!/bin/sh

cd /opt/arena || exit

git fetch origin

if [ $(git rev-list HEAD...origin/live --count) -gt 0 ]; then
    echo "New updates found, pulling changes..."
    git checkout live
    git pull
    docker build -t arena .
    docker-compose up -d
elif [ "$1" = "force" ]; then
    echo "Forcing update..."
    git checkout live
    git pull
    docker build -t arena .
    docker-compose up -d
else
    echo "No new updates."
fi