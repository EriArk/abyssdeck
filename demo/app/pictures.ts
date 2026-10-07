// Original, code-drawn sample artwork. No live screenshots or private project data.
export const pictures = ["Tidal observatory", "Across the dunes"].map(
  (title, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 680;
    const c = canvas.getContext("2d")!;
    const gradient = c.createLinearGradient(0, 0, 0, 680);
    gradient.addColorStop(0, index ? "#a87b70" : "#20464b");
    gradient.addColorStop(1, index ? "#ead1a4" : "#b8d1be");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 1000, 680);
    c.fillStyle = "#f4ddb4";
    c.beginPath();
    c.arc(750, 195, 65, 0, 7);
    c.fill();
    for (let row = 0; row < 4; row++) {
      c.fillStyle = index
        ? ["#c18c72", "#97655c", "#61474e", "#3c3949"][row]
        : ["#56877e", "#3a6b67", "#22494e", "#162f39"][row];
      c.beginPath();
      c.moveTo(0, 400 + row * 50);
      c.bezierCurveTo(
        220,
        260 + row * 65,
        450,
        650 - row * 20,
        1000,
        380 + row * 68,
      );
      c.lineTo(1000, 680);
      c.lineTo(0, 680);
      c.fill();
    }
    c.fillStyle = "#fff8e5";
    c.font = "18px sans-serif";
    c.fillText("NORTHSTAR / FIELD NOTES", 54, 58);
    c.font = "46px Georgia";
    c.fillText(title, 54, 603);
    c.font = "16px sans-serif";
    c.fillText("Original demo illustration · 2026", 56, 636);
    return { title, data: canvas.toDataURL("image/png") };
  },
);
