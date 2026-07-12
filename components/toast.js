const ensureToastRoot = () => {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    root.className = "fixed top-4 right-4 z-[60] space-y-2";
    document.body.appendChild(root);
  }
  return root;
};

export const showToast = (message, type = "info") => {
  const root = ensureToastRoot();
  const colors = {
    info: "bg-blue-600",
    success: "bg-green-600",
    error: "bg-red-600"
  };
  const node = document.createElement("div");
  node.className = `${colors[type] ?? colors.info} text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm`;
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => node.remove(), 4500);
};
