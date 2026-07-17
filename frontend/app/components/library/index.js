// Library component - search form and results
import { api } from "../../../core/api/client.js";
import { trackRow, standardTrackCommands } from "../../queue/render/index.js";
import { emptyHint } from "../../queue/render/emptyHint.js";
import { storageSet } from "../../../core/store/persistence.js";

export function createLibraryComponent(store) {
  const ui = {
    searchInput: document.getElementById("q"),
    searchField: document.getElementById("searchField"),
    searchForm: document.getElementById("searchForm"),
    resultsEl: document.getElementById("results"),
  };

  async function runSearch() {
    const q = ui.searchInput?.value?.trim() || "";
    const field = ui.searchField?.value || "";
    const params = new URLSearchParams({ q, field });
    const tracks = await api(`/api/search?${params}`);
    if (q !== ui.searchInput?.value?.trim() || field !== ui.searchField?.value) return;
    if (ui.resultsEl) {
      ui.resultsEl.replaceChildren(...(tracks.length ? tracks.map((track) => trackRow(track, standardTrackCommands(track.dedupe_key))) : [emptyHint("No matching tracks")]));
    }
  }

  return {
    start() {
      if (ui.searchForm) {
        ui.searchForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          await runSearch();
        });
      }

      if (ui.searchInput) {
        ui.searchInput.addEventListener("input", () => {
          storageSet("listen-party.searchText", ui.searchInput.value);
          clearTimeout(store.getState().searchTimer);
          if (ui.resultsEl) ui.resultsEl.replaceChildren();
          store.setState({
            searchTimer: setTimeout(() => runSearch().catch(console.error), 300),
          });
        });
      }

      if (ui.searchField) {
        ui.searchField.addEventListener("change", () => {
          storageSet("listen-party.searchField", ui.searchField.value);
          clearTimeout(store.getState().searchTimer);
          runSearch().catch(console.error);
        });
      }

      // Restore search preferences
      const storedText = localStorage.getItem("listen-party.searchText") || "";
      const storedField = localStorage.getItem("listen-party.searchField") || "";
      if (ui.searchInput) ui.searchInput.value = storedText;
      if (ui.searchField && [...ui.searchField.options].some((opt) => opt.value === storedField)) {
        ui.searchField.value = storedField;
      }

      runSearch().catch(console.error);
    },

    render() {
      // Search results are not re-rendered on state changes
    },

    teardown() {
      // No cleanup needed
    },

    // Public API
    runSearch,
  };
}
