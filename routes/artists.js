const { send } = require("micro");
const fs = require("fs");
const path = require("path");

module.exports = (req, res) => {
  const file = path.join(__dirname, "../lineups/this-aint-no-picnic-2022.txt");
  fs.readFile(file, "utf8", (err, string) => {
    if (err) return send(res, 500, { error: err.message });
    const artists = string
      .split("\n")
      .map((a) => {
        // strip country codes
        const m = a.match(/^(.+?)\s\((.+?)\)$/);
        const name = m ? m[1] : a;
        const country = m ? m[2] : null;
        const uid = a;
        return { uid, name, country };
      })
      .reduce((o, a) => {
        if (a.uid) {
          o[a.uid] = a;
        }
        return o;
      }, {});
    return send(res, 200, { artists });
  });
};
