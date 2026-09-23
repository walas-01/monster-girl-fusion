const images = import.meta.glob(
  "./assets/**/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
);

const IMAGE_ALIASES = {
  "monsters/pumpking.png": "monsters/pumpkin.png",
  "monsters/phoenyx.png": "monsters/phoenix.png",
};

export function getImage(path) {
  const resolvedPath = IMAGE_ALIASES[path] || path;
  return images[`./assets/${resolvedPath}`];
}

