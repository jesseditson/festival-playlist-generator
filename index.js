const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { send } = require("micro");
const cookie = require("cookie");
const spotifyApi = require("./lib/spotify-api");

let match = require("fs-router")(__dirname + "/routes");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    // Spotify auth
    const { query, pathname } = parsedUrl;
    if (pathname === "/" && query.code) {
      const grant = await spotifyApi.authorizationCodeGrant(query.code);
      const { access_token, refresh_token } = grant.body;
      res.setHeader(
        "Set-Cookie",
        cookie.serialize("access_token", access_token) +
          "; " +
          cookie.serialize("refresh_token", refresh_token)
      );
      res.setHeader("Location", "/");
      return send(res, 302, "");
    } else if (pathname === "/login") {
      const scopes = [
        "user-read-private",
        "user-read-email",
        "playlist-read-private",
        "playlist-modify-private",
        "playlist-modify-public",
        "playlist-read-collaborative",
      ];
      const authorizeURL = spotifyApi.createAuthorizeURL(scopes);
      res.setHeader("Location", authorizeURL);
      return send(res, 302, "Redirecting to Spotify...");
    }

    // Server Routes
    let matched = match(req);
    console.log(matched);
    if (matched) return matched(req, res);

    // Client Routes
    return handle(req, res, parsedUrl);
  }).listen(3000, (err) => {
    if (err) throw err;
    console.log("> Ready on port 3000");
  });
});
