// Tipe environment Hono bersama: userId & role di-set oleh middleware auth.
export type AppEnv = {
  Variables: {
    userId: string;
    role: string;
  };
};
