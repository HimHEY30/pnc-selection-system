// Stand-in for the "server-only" package in tests. The real one throws on purpose when it is
// imported anywhere but the Next.js server; unit tests run the server code directly.
export {};
