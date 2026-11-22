"use strict";
const el = id => document.getElementById(id);
const repo = "https://api.github.com/repos/cryptoferd/theslayers";
const storageKey = "theslayers.desk.v1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let session = "";
let previewUrl = "";
let pendingId = crypto.randomUUID();
function encode(bytes) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
const decode = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function keyFor(password, salt) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:600000}, material,
    {name:"AES-GCM",length:256}, false, ["encrypt","decrypt"]);
}
async function api(path, method = "GET", data, credential = session) {
  const response = await fetch(repo + path, {method,cache:"no-store",
    headers:{Authorization:"Bearer " + credential,"Content-Type":"application/json"},
    body:data === undefined ? undefined : JSON.stringify(data)});
  if (!response.ok) throw new Error([409,422].includes(response.status)
    ? "GitHub could not apply this update. Your draft is here. Retry or check the branch rules."
    : "GitHub returned " + response.status + ". Check your connection and repository token permissions.");
  return response.json();
}
const stored = localStorage.getItem(storageKey);
el("setup").hidden = Boolean(stored);
el("token").required = !stored;
el("password").minLength = stored ? 1 : 12;
el("password").autocomplete = stored ? "current-password" : "new-password";
el("help").textContent = stored ? "Unlock this device to write a field log or share a trail photo." :
  "Set up your journal desk on this device. Choose a username and a password of at least 12 characters.";
if (!stored) el("enter").textContent = "Connect this device";
el("gate").onsubmit = async event => {
  event.preventDefault();
  el("enter").disabled = true;
  try {
    const name = el("name").value.trim();
    if (!name) throw new Error("Enter a username.");
    let token;
    if (stored) {
      try {
        const vault = JSON.parse(stored);
        const key = await keyFor(el("password").value,decode(vault.salt));
        token = decoder.decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(vault.iv),additionalData:encoder.encode(name)},key,decode(vault.data)));
      } catch { throw new Error("The username or password did not unlock this device."); }
    } else {
      token = el("token").value.trim();
      const info = await api("", "GET", undefined, token);
      if (!info.permissions?.push || info.full_name.toLowerCase() !== "cryptoferd/theslayers") throw new Error("Use a token for an account with write access to theslayers.");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await keyFor(el("password").value,salt);
      const data = await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(name)},key,encoder.encode(token));
      localStorage.setItem(storageKey,JSON.stringify({salt:encode(salt),iv:encode(iv),data:encode(new Uint8Array(data))}));
    }
    session = token;
    el("gate").reset();
    el("gate").hidden = true;
    el("desk").hidden = false;
    el("owner").textContent = "Signed in as " + name;
    el("notice").textContent = "";
    el("title").focus();
  } catch(error) { el("notice").textContent = error.message; }
  finally { el("enter").disabled = false; }
};
el("lock").onclick = () => location.reload();
function updatePhoto() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const file = el("photo").files[0];
  previewUrl = file ? URL.createObjectURL(file) : "";
  if (file) el("preview").src = previewUrl;
  else el("preview").removeAttribute("src");
  el("preview").hidden = el("remove").hidden = !file;
}
function updateKind() {
  const gallery = el("kind").value === "gallery";
  el("photo").required = gallery;
  el("optional").hidden = gallery;
  el("bodyLabel").textContent = gallery ? "Photo caption" : "Field log";
}
el("photo").onchange = updatePhoto;
el("remove").onclick = () => { el("photo").value = ""; updatePhoto(); };
el("kind").onchange = updateKind;
async function jpeg(file) {
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    try { await image.decode(); } catch { throw new Error("This photo format could not be opened. Choose a JPEG or PNG."); }
    const scale = Math.min(1,1800 / Math.max(image.width,image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(image.width * scale));
    canvas.height = Math.max(1,Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/jpeg",.84).split(",")[1];
  } finally { URL.revokeObjectURL(url); }
}
async function publish(entry, photo) {
  const ref = await api("/git/ref/heads/main");
  const parent = ref.object.sha;
  const commit = await api("/git/commits/" + parent);
  const source = await api("/contents/journal.json?ref=" + parent);
  const entries = JSON.parse(decoder.decode(decode(source.content)));
  if (entries.some(item => item.id === entry.id)) return;
  const tree = [];
  if (photo) {
    const path = "photos/" + entry.id + ".jpg";
    const blob = await api("/git/blobs","POST",{encoding:"base64",content:await jpeg(photo)});
    tree.push({path,mode:"100644",type:"blob",sha:blob.sha});
    entry.photo = "https://cryptoferd.github.io/theslayers/" + path;
  }
  tree.push({path:"journal.json",mode:"100644",type:"blob",content:JSON.stringify([entry,...entries],null,2) + "\n"});
  const nextTree = await api("/git/trees","POST",{base_tree:commit.tree.sha,tree});
  const next = await api("/git/commits","POST",{message:"Publish: " + entry.title,tree:nextTree.sha,parents:[parent]});
  await api("/git/refs/heads/main","PATCH",{sha:next.sha,force:false});
}
el("editor").onsubmit = async event => {
  event.preventDefault();
  const entry = {id:pendingId,kind:el("kind").value,title:el("title").value.trim(),body:el("body").value.trim(),date:new Date().toISOString()};
  const photo = el("photo").files[0];
  if (!entry.title || !entry.body) { el("notice").textContent = "Enter a title and some text."; return; }
  const controls = [...el("editor").elements,el("lock")];
  controls.forEach(control => control.disabled = true);
  el("notice").textContent = "Publishing your entry…";
  try {
    await publish(entry,photo);
    pendingId = crypto.randomUUID();
    el("editor").reset(); updateKind(); updatePhoto();
    el("notice").textContent = "Published to GitHub. Your journal will update when deployment finishes.";
  } catch(error) { el("notice").textContent = error.message; }
  finally { controls.forEach(control => control.disabled = false); }
};
