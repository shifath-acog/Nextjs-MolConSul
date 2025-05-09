# Step 1: Build the app
FROM node:18 AS builder
WORKDIR /app

# Copy files and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy the rest of the app and build it
COPY . .
RUN npm run build

# Step 2: Run the app
FROM node:18-alpine
WORKDIR /app

# Install Docker CLI
RUN apk add --no-cache docker-cli

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Create the /app/temp directory and set permissions
RUN mkdir -p /app/temp \
    && chown -R nextjs:nodejs /app

# Copy only necessary files from builder
COPY --from=builder --chown=nextjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Set the user to non-root
USER nextjs

EXPOSE 3000

# Start the Next.js app
CMD ["npm", "start"]