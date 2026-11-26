/** Error de negocio con código estable; las acciones lo traducen a un mensaje con i18n (`errors.<code>`). */
export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ServiceError";
  }
}
