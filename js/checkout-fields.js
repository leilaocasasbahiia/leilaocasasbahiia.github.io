(function () {
  "use strict";
  var form = document.getElementById("checkoutForm");
  var cpf = form.elements.document, zip = form.elements.zipCode;
  cpf.addEventListener("input", function () {
    cpf.value = cpf.value.replace(/\D/g, "").slice(0, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  });
  var sequence = 0;
  zip.addEventListener("input", function () { sequence++; var value = zip.value.replace(/\D/g, "").slice(0, 8); zip.value = value.replace(/^(\d{5})(\d)/, "$1-$2"); });
  zip.addEventListener("blur", async function () {
    var value = zip.value.replace(/\D/g, ""), current = ++sequence, feedback = document.getElementById("checkoutZipFeedback");
    if (value.length !== 8) return;
    var names = ["street", "district", "city", "state"], original = {};
    names.forEach(function (name) { original[name] = form.elements[name].value; });
    feedback.textContent = "Consultando CEP…";
    try {
      var response = await fetch("https://viacep.com.br/ws/" + value + "/json/", { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(); var data = await response.json();
      if (current !== sequence) return;
      if (data.erro) { feedback.textContent = "CEP não encontrado. Confira ou preencha o endereço."; return; }
      var values = { street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf };
      names.forEach(function (name) { if (values[name] && form.elements[name].value === original[name]) form.elements[name].value = values[name]; });
      feedback.textContent = "Endereço localizado. Confira os dados e informe o número.";
    } catch (_) { if (current === sequence) feedback.textContent = "Preencha o endereço manualmente."; }
  });
})();
