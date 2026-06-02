# Use the official lightweight Node.js image
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
# (You will generate these when you run 'npm create vite@latest .' in this folder)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Expose Vite's default development port
EXPOSE 5173

# Start the Vite development server, binding to all network interfaces
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
