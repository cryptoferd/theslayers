async function loadJournal() {
  const response = await fetch("journal.json", {cache: "no-cache"});
  if (!response.ok) throw new Error("Journal unavailable");
  const entries = await response.json();
  for (const entry of entries) {
    if (!["blog", "gallery"].includes(entry.kind)) continue;
    const section = document.getElementById(entry.kind);
    section.querySelector(":scope > p:last-of-type:not(.eyebrow)")?.remove();
    const article = document.createElement("article");
    const title = document.createElement("h3");
    title.textContent = entry.title;
    article.append(title);
    if (entry.photo?.startsWith("https://")) {
      const img = document.createElement("img");
      img.src = entry.photo;
      img.alt = entry.body;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      article.append(img);
    }
    const copy = document.createElement("p");
    copy.textContent = entry.body;
    article.append(copy);
    section.append(article);
  }
}
loadJournal().catch(() => {
  for (const id of ["blog", "gallery"]) {
    document.querySelector("#" + id + " > p:last-child").textContent = "Entries could not be loaded. Refresh to try again.";
  }
});

