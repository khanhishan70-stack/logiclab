document.addEventListener('DOMContentLoaded', function () {
    var body = document.body;

    /* ---- Theme toggle (persisted) ---- */
    var stored = null;
    try { stored = localStorage.getItem('logiclab-theme'); } catch (e) {}

    if (stored === 'light' && !body.classList.contains('light-mode')) {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
    } else if (stored === 'dark' && !body.classList.contains('dark-mode')) {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
    }

    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function () {
            body.classList.toggle('dark-mode');
            body.classList.toggle('light-mode');
            themeToggle.textContent = body.classList.contains('dark-mode') ? '🌙' : '☀️';
            try { localStorage.setItem('logiclab-theme', body.classList.contains('dark-mode') ? 'dark' : 'light'); } catch (e) {}
        });
        themeToggle.textContent = body.classList.contains('dark-mode') ? '🌙' : '☀️';
    }

    /* ---- Mobile navigation ---- */
    var hamburger = document.querySelector('.hamburger');
    var navLinks = document.querySelector('.nav-links');

    function closeNav() {
        if (navLinks) navLinks.classList.remove('open');
        if (hamburger) hamburger.textContent = '☰';
    }

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', function () {
            var open = navLinks.classList.toggle('open');
            hamburger.textContent = open ? '✕' : '☰';
        });
        navLinks.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', closeNav);
        });
    }

    document.addEventListener('click', function (e) {
        var navbar = document.querySelector('.navbar');
        if (navbar && !navbar.contains(e.target)) closeNav();
    });
});