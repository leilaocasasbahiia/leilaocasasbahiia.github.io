(function () {
  "use strict";

  /* ---------- Email domain autocomplete ---------- */
  (function emailAutocomplete() {
    var DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com.br", "icloud.com"];

    var list = document.createElement("ul");
    list.className = "email-autocomplete";
    list.hidden = true;
    document.body.appendChild(list);

    var activeInput = null;

    function hide() {
      list.hidden = true;
      list.innerHTML = "";
      activeInput = null;
    }

    function position(input) {
      var rect = input.getBoundingClientRect();
      list.style.top = (window.scrollY + rect.bottom + 4) + "px";
      list.style.left = (window.scrollX + rect.left) + "px";
      list.style.width = rect.width + "px";
    }

    function choose(input, email) {
      input.value = email;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      hide();
    }

    function show(input) {
      var value = input.value;
      var atIndex = value.indexOf("@");
      if (atIndex <= 0) { hide(); return; }

      var localPart = value.slice(0, atIndex);
      var domainTyped = value.slice(atIndex + 1).toLowerCase();
      var matches = DOMAINS.filter(function (d) { return d.indexOf(domainTyped) === 0; });

      if (!matches.length || matches.length === 1 && matches[0] === domainTyped) { hide(); return; }

      list.innerHTML = matches.map(function (d) {
        var email = localPart + "@" + d;
        return '<li><button type="button">' + localPart + "@<strong>" + d + "</strong></button></li>";
      }).join("");

      Array.prototype.forEach.call(list.querySelectorAll("button"), function (btn, i) {
        btn.addEventListener("mousedown", function (e) {
          e.preventDefault();
          choose(input, localPart + "@" + matches[i]);
        });
      });

      activeInput = input;
      position(input);
      list.hidden = false;
    }

    document.addEventListener("input", function (e) {
      if (e.target.matches && e.target.matches('input[type="email"]')) show(e.target);
    });
    document.addEventListener("focusout", function (e) {
      if (e.target === activeInput) setTimeout(hide, 150);
    });
    window.addEventListener("scroll", function () { if (activeInput) position(activeInput); }, true);
    window.addEventListener("resize", function () { if (activeInput) hide(); });
  })();

  /* ---------- Traffic source attribution (UTM) ---------- */
  (function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    var utmSource = params.get("utm_source");

    if (utmSource) {
      localStorage.setItem("attribution", JSON.stringify({
        source: utmSource,
        medium: params.get("utm_medium") || "",
        campaign: params.get("utm_campaign") || "",
        term: params.get("utm_term") || "",
        content: params.get("utm_content") || "",
        capturedAt: Date.now(),
      }));
      return;
    }

    if (!localStorage.getItem("attribution")) {
      var ref = document.referrer;
      var source = "direto";
      var medium = "direct";
      if (ref) {
        medium = "referral";
        try { source = new URL(ref).hostname.replace(/^www\./, ""); } catch (e) { source = "referencia"; }
      }
      localStorage.setItem("attribution", JSON.stringify({
        source: source, medium: medium, campaign: "", term: "", content: "", capturedAt: Date.now(),
      }));
    }
  })();

  window.getAttribution = function () {
    try {
      return JSON.parse(localStorage.getItem("attribution")) || { source: "direto", medium: "", campaign: "" };
    } catch (e) {
      return { source: "direto", medium: "", campaign: "" };
    }
  };

  /* ---------- Promo bar ---------- */
  var promoBar = document.getElementById("promoBar");
  var promoClose = document.getElementById("promoClose");
  var promoForm = document.getElementById("promoForm");
  var promoSuccess = document.getElementById("promoSuccess");
  var promoToggle = document.getElementById("promoToggle");

  if (promoBar && localStorage.getItem("promoBarClosed") === "1") {
    promoBar.classList.add("is-hidden");
  }
  if (promoToggle) {
    promoToggle.addEventListener("click", function () {
      var expanded = promoBar.classList.toggle("is-expanded");
      promoToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
  }
  if (promoClose) {
    promoClose.addEventListener("click", function () {
      promoBar.classList.add("is-hidden");
      localStorage.setItem("promoBarClosed", "1");
    });
  }
  if (promoForm) {
    promoForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("promoEmail").value.trim();
      var phone = document.getElementById("promoPhone").value.trim();
      var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!emailOk || !phone) {
        promoForm.querySelectorAll("input").forEach(function (input) {
          input.style.outline = input.value.trim() === "" || (input.type === "email" && !emailOk) ? "2px solid " + getComputedStyle(document.documentElement).getPropertyValue("--brand-red") : "";
        });
        return;
      }
      promoForm.hidden = true;
      promoSuccess.hidden = false;
    });
  }

  /* ---------- CEP modal ---------- */
  var cepBtn = document.getElementById("cepBtn");
  var cepBtnLabel = cepBtn ? cepBtn.querySelector("span") : null;
  var cepModalOverlay = document.getElementById("cepModalOverlay");
  var cepPopoverClose = document.getElementById("cepPopoverClose");
  var cepInput = document.getElementById("cepInput");
  var cepConfirm = document.getElementById("cepConfirm");
  var cepFeedback = document.getElementById("cepFeedback");

  function formatCep(digits) {
    return digits.slice(0, 5) + "-" + digits.slice(5);
  }

  function setCepFeedback(text, state) {
    if (!cepFeedback) return;
    cepFeedback.textContent = text || "";
    cepFeedback.className = "cep-modal__feedback" + (state ? " is-" + state : "");
  }

  function applySavedLocation() {
    if (!cepBtn) return;
    var saved = localStorage.getItem("userLocation");
    if (!saved) return;
    try {
      var loc = JSON.parse(saved);
      if (cepBtnLabel) cepBtnLabel.textContent = loc.city || loc.cep;
      if (cepInput) cepInput.value = loc.cep;
      if (loc.address) setCepFeedback("Endereço atual: " + loc.address + ", " + loc.city, "success");
    } catch (e) {}
  }
  applySavedLocation();

  function openCepModal() {
    cepModalOverlay.classList.add("is-open");
    if (cepInput) cepInput.focus();
  }
  function closeCepModal() {
    cepModalOverlay.classList.remove("is-open");
  }

  if (cepBtn) cepBtn.addEventListener("click", openCepModal);
  if (cepPopoverClose) cepPopoverClose.addEventListener("click", closeCepModal);
  if (cepModalOverlay) {
    cepModalOverlay.addEventListener("click", function (e) {
      if (e.target === cepModalOverlay) closeCepModal();
    });
  }
  if (cepModalOverlay) {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && cepModalOverlay.classList.contains("is-open")) closeCepModal();
    });
  }
  if (cepInput) {
    cepInput.addEventListener("input", function () {
      cepInput.style.outline = "";
      setCepFeedback("");
      var digits = cepInput.value.replace(/\D/g, "").slice(0, 8);
      cepInput.value = digits.length > 5 ? formatCep(digits) : digits;
    });
  }
  if (cepConfirm) {
    cepConfirm.addEventListener("click", function () {
      var digits = cepInput.value.replace(/\D/g, "");
      if (digits.length !== 8) {
        cepInput.style.outline = "2px solid " + getComputedStyle(document.documentElement).getPropertyValue("--brand-red");
        setCepFeedback("Digite um CEP válido com 8 números.", "error");
        return;
      }

      cepConfirm.disabled = true;
      cepConfirm.textContent = "Consultando...";
      setCepFeedback("Buscando endereço...", "loading");

      fetch("https://viacep.com.br/ws/" + digits + "/json/")
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.erro) {
            setCepFeedback("CEP não encontrado. Verifique e tente novamente.", "error");
            return;
          }
          var formatted = formatCep(digits);
          var city = [data.localidade, data.uf].filter(Boolean).join(" - ");
          var address = [data.logradouro, data.bairro].filter(Boolean).join(", ");
          var location = { cep: formatted, city: city, address: address };
          localStorage.setItem("userLocation", JSON.stringify(location));
          if (cepBtnLabel) cepBtnLabel.textContent = city || formatted;
          setCepFeedback((address ? address + ", " : "") + city, "success");
          setTimeout(closeCepModal, 1100);
        })
        .catch(function () {
          setCepFeedback("Não foi possível consultar o CEP agora. Tente novamente.", "error");
        })
        .then(function () {
          cepConfirm.disabled = false;
          cepConfirm.textContent = "Confirmar";
        });
    });
  }

  /* ---------- Mobile category drawer ---------- */
  var mobileMenuBtn = document.getElementById("mobileMenuBtn");
  var categoryNav = document.getElementById("categoryNav");
  var navOverlay = document.getElementById("navOverlay");
  var navClose = document.getElementById("navClose");

  function openNav() {
    categoryNav.classList.add("is-open");
    navOverlay.classList.add("is-open");
  }
  function closeNav() {
    categoryNav.classList.remove("is-open");
    navOverlay.classList.remove("is-open");
  }
  if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", openNav);
  if (navClose) navClose.addEventListener("click", closeNav);
  if (navOverlay) navOverlay.addEventListener("click", closeNav);

  /* ---------- Mobile filter drawer ---------- */
  var filtersPanel = document.getElementById("filtersPanel");
  var filterOverlay = document.getElementById("filterOverlay");
  var mobileFilterBtn = document.getElementById("mobileFilterBtn");
  var filtersClose = document.getElementById("filtersClose");

  function openFilters() {
    filtersPanel.classList.add("is-open");
    filterOverlay.classList.add("is-open");
  }
  function closeFilters() {
    filtersPanel.classList.remove("is-open");
    filterOverlay.classList.remove("is-open");
  }
  if (mobileFilterBtn) mobileFilterBtn.addEventListener("click", openFilters);
  if (filtersClose) filtersClose.addEventListener("click", closeFilters);
  if (filterOverlay) filterOverlay.addEventListener("click", closeFilters);

  /* ---------- Countdown timers ---------- */
  var timerEls = Array.prototype.slice.call(document.querySelectorAll(".timer"));
  var timerState = timerEls.map(function (el) {
    return { el: el, endsAt: Date.now() + parseInt(el.getAttribute("data-duration"), 10) * 1000 };
  });

  function formatRemaining(ms) {
    if (ms <= 0) return "Encerrado";
    var totalSeconds = Math.floor(ms / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    if (days > 0) return days + "d " + pad(hours) + "h";
    return pad(hours) + ":" + pad(minutes) + ":" + pad(seconds);
  }

  function tickTimers() {
    var now = Date.now();
    timerState.forEach(function (t) {
      var remaining = t.endsAt - now;
      t.el.textContent = formatRemaining(remaining);
      var row = t.el.closest(".card__timer") || t.el.closest(".pdp__status-timer");
      if (row && remaining > 0 && remaining < 3600 * 1000) {
        row.classList.add("card__timer--urgent", "pdp__status-timer--urgent");
      }
    });
  }
  tickTimers();
  setInterval(tickTimers, 1000);

  /* ---------- Favorite toggle ---------- */
  document.querySelectorAll(".fav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.classList.toggle("is-active");
    });
  });

  /* ---------- "Dar lance agora" navigates to the product page ---------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".bid-btn");
    if (!btn) return;
    var card = btn.closest(".card");
    var link = card && card.querySelector(".card__thumb");
    if (link) window.location.href = getUrlWithUtm(link.getAttribute("href"));
  });

  /* ---------- Filtering ---------- */
  var cardGrid = document.getElementById("cardGrid");
  var cards = cardGrid ? Array.prototype.slice.call(cardGrid.querySelectorAll(".card")) : [];
  var resultsCount = document.getElementById("resultsCount");
  var noResults = document.getElementById("noResults");
  var searchInput = document.getElementById("searchInput");
  var searchForm = document.getElementById("searchForm");
  var clearFiltersLink = document.getElementById("clearFilters");

  function getActiveValues(groupName) {
    var boxes = document.querySelectorAll('[data-filter-group="' + groupName + '"] input[type=checkbox]:checked');
    return Array.prototype.slice.call(boxes).map(function (b) { return b.getAttribute("data-filter-value"); });
  }

  function priceInRange(bid, rangeStr) {
    var parts = rangeStr.split("-");
    var min = parseFloat(parts[0]);
    var max = parseFloat(parts[1]);
    return bid >= min && bid <= max;
  }

  function applyFilters() {
    if (!cardGrid) return;
    var activeCategories = getActiveValues("category");
    var activeStatuses = getActiveValues("status");
    var activePrices = getActiveValues("price");
    var query = (searchInput && searchInput.value || "").trim().toLowerCase();

    var visibleCount = 0;

    cards.forEach(function (card) {
      var category = card.getAttribute("data-category");
      var status = card.getAttribute("data-status");
      var bid = parseFloat(card.getAttribute("data-bid"));
      var title = (card.getAttribute("data-title") || "").toLowerCase();

      var matchesCategory = activeCategories.length === 0 || activeCategories.indexOf(category) !== -1;
      var matchesStatus = activeStatuses.length === 0 || activeStatuses.indexOf(status) !== -1;
      var matchesPrice = activePrices.length === 0 || activePrices.some(function (r) { return priceInRange(bid, r); });
      var matchesSearch = query === "" || title.indexOf(query) !== -1;

      var visible = matchesCategory && matchesStatus && matchesPrice && matchesSearch;
      card.classList.toggle("is-hidden", !visible);
      if (visible) visibleCount++;
    });

    if (resultsCount) resultsCount.textContent = visibleCount + (visibleCount === 1 ? " leilão encontrado" : " leilões encontrados");
    if (noResults) noResults.hidden = visibleCount !== 0;
  }

  document.querySelectorAll('.filter-group__body input[type=checkbox]').forEach(function (box) {
    box.addEventListener("change", applyFilters);
  });

  if (searchForm) {
    searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var query = searchInput ? searchInput.value.trim() : "";
      if (cardGrid) {
        applyFilters();
        var resultsSection = document.querySelector(".results");
        if (resultsSection) resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.location.href = getUrlWithUtm(query ? "index.html?q=" + encodeURIComponent(query) : "index.html");
      }
    });
  }
  if (searchInput && cardGrid) {
    searchInput.addEventListener("input", applyFilters);
  }

  if (cardGrid && searchInput) {
    var urlQuery = new URLSearchParams(window.location.search).get("q");
    if (urlQuery) {
      searchInput.value = urlQuery;
      applyFilters();
    }
  }

  if (clearFiltersLink) {
    clearFiltersLink.addEventListener("click", function (e) {
      e.preventDefault();
      document.querySelectorAll('.filter-group__body input[type=checkbox]').forEach(function (b) { b.checked = false; });
      if (searchInput) searchInput.value = "";
      applyFilters();
    });
  }

  /* ---------- Sorting ---------- */
  var sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      var value = sortSelect.value;
      var sorted = cards.slice().sort(function (a, b) {
        var bidA = parseFloat(a.getAttribute("data-bid"));
        var bidB = parseFloat(b.getAttribute("data-bid"));
        var bidsA = parseInt(a.getAttribute("data-bids"), 10);
        var bidsB = parseInt(b.getAttribute("data-bids"), 10);
        var durA = parseInt(a.getAttribute("data-duration"), 10);
        var durB = parseInt(b.getAttribute("data-duration"), 10);

        if (value === "maior-lance") return bidB - bidA;
        if (value === "menor-lance") return bidA - bidB;
        if (value === "mais-lances") return bidsB - bidsA;
        if (value === "encerrando") return durA - durB;
        return 0;
      });
      sorted.forEach(function (card) { cardGrid.appendChild(card); });
    });
  }

  /* ---------- Contador de visitantes ao vivo (heartbeat pro admin) ---------- */
  (function heartbeat() {
    var VISITOR_KEY = "arremata_visitor_id";
    var visitorId = sessionStorage.getItem(VISITOR_KEY);
    if (!visitorId) {
      visitorId = "v-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      sessionStorage.setItem(VISITOR_KEY, visitorId);
    }

    function ping() {
      fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: visitorId }),
        keepalive: true,
      }).catch(function () {});
    }

    ping();
    setInterval(ping, 15000);
  })();
})();
