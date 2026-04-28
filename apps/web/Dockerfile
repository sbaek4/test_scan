FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 5173
CMD ["npm","run","dev","--workspace","@test-scan/web","--","--host","0.0.0.0"]
