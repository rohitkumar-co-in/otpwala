process.env.NODE_ENV = 'development';
const { dev } = await import('astro');

const server = await dev({
  root: '.',
});

console.log(`OTPWala Web dev server running.`);
