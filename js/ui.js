export const toggleLoader = (show) => {
  const loader = document.getElementById("global-loader");
  if (!loader) {
    console.warn("[ui] global-loader no encontrado en DOM");
    return;
  }
  if (show) {
    loader.classList.remove("hidden");
    loader.classList.add("flex");
  } else {
    loader.classList.add("hidden");
    loader.classList.remove("flex");
  }
};

export const showLoader = () => toggleLoader(true);
export const hideLoader = () => toggleLoader(false);

export const estadoMesaClass = (estado) => {
  const map = {
    libre: "estado-libre",
    ocupada: "estado-ocupada",
    cobrando: "estado-cobrando",
    pagada: "estado-pagada",
    reservada: "estado-reservada"
  };
  return map[estado] ?? "bg-zinc-800";
};
