// Smooth scroll reveal animations
document.addEventListener('DOMContentLoaded', () => {
  // Nav scroll effect
  const nav = document.querySelector('.nav');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      nav.style.boxShadow = '0 4px 30px rgba(0,0,0,0.3)';
    } else {
      nav.style.boxShadow = 'none';
    }
  });

  // Active nav link
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 100;
      if (window.scrollY >= sectionTop) {
        current = section.getAttribute('id');
      }
    });
    navLinks.forEach(link => {
      link.style.color = link.getAttribute('href') === `#${current}` ? '#fff' : '#a1a1aa';
    });
  });

  // Fade in elements on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.timeline-card, .skill-group, .edu-card, .highlight-card, .contact-card, .achievement').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });

  // Typewriter effect for hero title
  const titleEl = document.querySelector('.hero-title');
  const phrases = [
    'Senior Backend Developer & Systems Engineer',
    'Full-Stack Problem Solver',
    'DevOps Enthusiast',
    'Open Source Contributor'
  ];
  let phraseIndex = 1;

  setInterval(() => {
    titleEl.style.opacity = '0';
    setTimeout(() => {
      titleEl.textContent = phrases[phraseIndex];
      titleEl.style.opacity = '1';
      phraseIndex = (phraseIndex + 1) % phrases.length;
    }, 300);
  }, 4000);
  titleEl.style.transition = 'opacity 0.3s ease';
});
