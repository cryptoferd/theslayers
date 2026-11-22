"use strict";
const el = id => document.getElementById(id);
const repo = "https://api.github.com/repos/cryptoferd/theslayers";
const file = repo + "/contents/journal.json";
let session = "";
async function github(url, token, options = {}) {
  const response = await fetch(url, {
    ...options, cache: "no-store",
    headers: {Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json"}
  });
  if (!response.ok) {
    const messages = {
      401: "GitHub rejected the token. Check its value and expiry.",
      403: "GitHub denied this request. Check the token’s repository access and Contents permission.",
      409: "Another update arrived. Review the live site, then retry if needed.",
      422: "GitHub declined the update. Check the repository’s branch rules."
    };
    throw new Error(messages[response.status] || "GitHub returned HTTP " + response.status + ".");
  }
  return response.json();
}
el("login").onsubmit = async event => {
  event.preventDefault();
  const token = el("token").value.trim();
  el("token").value = "";
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const user = await github("https://api.github.com/user", token);
    const info = await github(repo, token);
    if (!info.permissions?.push) throw new Error("This account needs write access to theslayers.");
    session = token;
    el("identity").textContent = "Signed in as " + user.login;
    el("login").hidden = true;
    el("desk").hidden = false;
    el("notice").textContent = "";
  } catch (error) { el("notice").textContent = error.message; }
  finally { button.disabled = false; }
};
el("logout").onclick = () => { session = ""; location.reload(); };
el("kind").onchange = () => {
  const gallery = el("kind").value === "gallery";
  el("photoLabel").hidden = !gallery;
  el("photo").required = gallery;
  el("photo").disabled = !gallery;
  el("bodyLabel").textContent = gallery ? "Photo description" : "Post";
};
el("editor").onsubmit = async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  el("notice").textContent = "Publishing…";
  try {
    const kind = el("kind").value;
    const title = el("title").value.trim();
    const body = el("body").value.trim();
    if (!title || !body) throw new Error("Enter a title and description.");
    const entry = {kind, title, body, date: new Date().toISOString()};
    if (kind === "gallery") {
      const photo = new URL(el("photo").value);
      if (photo.protocol !== "https:" || photo.username || photo.password) throw new Error("Use a public HTTPS image URL.");
      entry.photo = photo.href;
    }
    const current = await github(file + "?ref=main", session);
    const bytes = Uint8Array.from(atob(current.content), c => c.charCodeAt(0));
    const entries = JSON.parse(new TextDecoder().decode(bytes));
    entries.unshift(entry);
    const encoded = new TextEncoder().encode(JSON.stringify(entries, null, 2) + "\n");
    const content = btoa(Array.from(encoded, b => String.fromCharCode(b)).join(""));
    await github(file, session, {method:"PUT", body:JSON.stringify({
      message:"Publish journal entry: " + title, branch:"main", sha:current.sha, content
    })});
    el("editor").reset();
    el("kind").onchange();
    el("notice").textContent = "Saved to GitHub. The entry will appear after GitHub Pages deploys.";
  } catch (error) { el("notice").textContent = error.message; }
  finally { button.disabled = false; }
};
