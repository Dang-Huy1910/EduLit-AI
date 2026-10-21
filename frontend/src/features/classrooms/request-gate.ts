export function createRequestGate<T>() {
  let active: Promise<T> | undefined;

  return {
    run(factory: () => Promise<T>): Promise<T> {
      if (active) return active;
      const request = factory();
      active = request;
      request.then(
        () => {
          if (active === request) active = undefined;
        },
        () => {
          if (active === request) active = undefined;
        }
      );
      return request;
    },
  };
}
