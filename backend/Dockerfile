FROM node:24-alpine

WORKDIR /app

# this is an efficiency hack
# we copy only package.json and package-lock.json
# which are required for npm install
COPY ./package*.json ./

# then we run npm install, which most of the times will come from cache
# it will not come from cache only if we change a dependency
# what do we change more often? code or dependencies? code!
# this is why we want to build dependencies and copy code only after
RUN npm install

COPY ./ ./

RUN npm run build

CMD ["npm", "start"]
