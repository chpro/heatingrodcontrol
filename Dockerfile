FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Bundle app source
COPY heatingrodcontrol.js .

CMD [ "node", "heatingrodcontrol.js" ]