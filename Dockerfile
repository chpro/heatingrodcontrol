FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app
COPY package*.json ./

RUN npm install
# Bundle app source
COPY heatingrodcontrol*.js ./
EXPOSE 3000
CMD [ "node", "heatingrodcontrolws.js" ]