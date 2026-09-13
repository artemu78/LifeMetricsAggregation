# Use one schema-first OpenAPI contract for the local dashboard

The dashboard uses a hand-maintained OpenAPI 3.1.1 document as its only exchange contract. Python validation models and TypeScript types are generated from that document and checked into the repository, while FastAPI serves both the API and the built React application on 127.0.0.1; this keeps private data local and prevents the server and UI from defining competing JSON shapes.
