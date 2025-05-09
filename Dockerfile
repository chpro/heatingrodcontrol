FROM node:24-alpine

# Create app directory
WORKDIR /usr/src/app
COPY package*.json ./

RUN npm install
# Bundle app source
COPY app ./
EXPOSE 3000
CMD [ "node", "webservice.js" ]