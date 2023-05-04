// https://github.com/remix-run/remix/tree/templates_v2_dev/templates/express

import express from "express";
import compression from "compression";
import morgan from "morgan";
import { createRequestHandler } from "@remix-run/express";
import { broadcastDevReady, installGlobals } from "@remix-run/node";
import WebSocket from "ws";

import { createServer } from "https";
import { readFileSync } from "fs";

import * as build from "./build/index.js";

installGlobals();

const app = express();

app.use(compression());

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable("x-powered-by");

// Remix fingerprints its assets so we can cache forever.
app.use(
	"/build",
	express.static("public/build", { immutable: true, maxAge: "1y" })
);

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(express.static("public", { maxAge: "1h" }));

app.use(morgan("tiny"));

const httpsOptions = {
	key: readFileSync(`${process.cwd()}/localhost-key.pem`),
	cert: readFileSync(`${process.cwd()}/localhost.pem`),
};

app.all(
	"*",
	createRequestHandler({
		build,
		mode: process.env.NODE_ENV,
	})
);

const port = process.env.PORT || 3000;

const server = createServer(httpsOptions, app);
server.listen(port, () => {
	console.log(`Express server listening on port ${port}`);

	if (process.env.NODE_ENV === "development") {
		broadcastDevReady(build);
	}
});

if (process.env.NODE_ENV !== "production") {
	const connectToRemixSocket = (cb, attempts = 0) => {
		const remixSocket = new WebSocket(`ws://127.0.0.1:3333`);

		remixSocket.once("open", () => {
			console.log("Connected to remix dev socket");

			cb(null, remixSocket);
		});

		remixSocket.once("error", (error) => {
			if (attempts < 3) {
				setTimeout(() => {
					connectToRemixSocket(cb, (attempts += 1));
				}, 1000);
			} else {
				cb(error, null);
			}
		});
	};

	connectToRemixSocket((error, remixSocket) => {
		if (error) {
			throw error;
		}

		const customSocket = new WebSocket.Server({ server });

		remixSocket.on("message", (message) => {
			customSocket.clients.forEach((client) => {
				if (client.readyState === WebSocket.OPEN) {
					client.send(message.toString());
				}
			});
		});
	});
}
