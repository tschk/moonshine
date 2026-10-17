export const before = [
  async (_context: unknown, next: () => Promise<Response>) => {
    const response = await next();
    response.headers.set("x-native-middleware", "yes");
    return response;
  },
];
