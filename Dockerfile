# Use the official Node.js image as the base image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the package.json and yarn.lock files to install dependencies
COPY package.json yarn.lock ./

# Install Node.js dependencies using Yarn
RUN yarn install

# Copy the rest of the application files to the working directory
COPY . .

# Expose the port your application runs on
EXPOSE 8083

# Define the command to run your application
CMD ["node", "server.js"]