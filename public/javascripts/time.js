document.addEventListener("DOMContentLoaded", () => {
  function updateTime() {
    const now = new Date();
    const time = now.toLocaleTimeString();

    const el = document.getElementById("time");
    if (el) el.innerText = time;
  }

  updateTime();
  setInterval(updateTime, 1000);
});
