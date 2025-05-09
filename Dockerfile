FROM node:21-alpine3.17

WORKDIR /daimon

COPY . .
RUN npm install
RUN npm run build

ENV INTERACTIVE false

CMD ["npm", "start"]