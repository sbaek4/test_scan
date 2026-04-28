FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build --workspace @test-scan/worker
CMD ["npm","run","dev","--workspace","@test-scan/worker"]
