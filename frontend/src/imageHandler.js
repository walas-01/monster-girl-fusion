const images = import.meta.glob(
  "./assets/**/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    import: "default",
  }
);


export function getImage(path) {
  return images[`./assets/${path}`];
}

