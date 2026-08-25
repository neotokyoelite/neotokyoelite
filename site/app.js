async function main() {
  const grid = document.getElementById('grid');
  const emptyState = document.getElementById('empty-state');
  const updated = document.getElementById('updated');
  const threshold = document.getElementById('threshold');

  let data;
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    data = await res.json();
  } catch (err) {
    updated.textContent = 'Failed to load listings.';
    return;
  }

  threshold.textContent = data.rarityThreshold;
  const generated = new Date(data.generatedAt);
  updated.textContent = `Last updated: ${generated.toLocaleString()}`;

  if (!data.citizens || data.citizens.length === 0) {
    emptyState.hidden = false;
    return;
  }

  for (const citizen of data.citizens) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = citizen.openseaUrl;
    card.target = '_blank';
    card.rel = 'noopener';

    card.innerHTML = `
      <img src="${citizen.image}" alt="Citizen #${citizen.tokenId}" loading="lazy">
      <div class="card-body">
        <p class="card-id">Citizen #${citizen.tokenId}</p>
        <span class="card-rank">Rank ${citizen.rarityRank}</span>
        <p class="card-price">${citizen.price.toFixed(3)} ${citizen.currency}</p>
      </div>
    `;
    grid.appendChild(card);
  }
}

main();
