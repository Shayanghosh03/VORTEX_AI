// Simple page fade-in and fade-out transitions
(function () {
  if (typeof window === "undefined") return;

  const body = document.body;
  body.classList.add("page-enter");

  window.addEventListener("load", function () {
    // trigger enter animation
    requestAnimationFrame(function () {
      body.classList.add("page-enter-active");
    });
  });

  // intercept same-window navigations for smooth fade-out
  document.addEventListener("click", function (e) {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    const target = link.getAttribute("target");

    // only handle internal links, no hashes, no new tab
    if (!href || href.startsWith("#") || target === "_blank") return;
    if (href.startsWith("http")) return;

    e.preventDefault();

    body.classList.add("page-leave");

    setTimeout(function () {
      window.location.href = href;
    }, 220); // keep in sync with CSS transition duration
  });
})();

// ----------- hamburger menu toggle -----------

document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.querySelector(".nav-links");

  if (hamburger) {
    hamburger.addEventListener("click", () => {
      navLinks.classList.toggle("active");
    });
  }
});
