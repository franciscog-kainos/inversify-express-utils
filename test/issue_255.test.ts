import * as express from "express";
import { Container } from "inversify";
import { cleanUpMetadata, controller, httpGet, InversifyExpressServer, BaseMiddleware } from "../src/index";
import { interfaces } from "../src/interfaces";
import supertest = require("supertest");

const promiseData = "Here's your data";

const asyncRequest = (reject: boolean) => new Promise<string>(function (resolve, rej) {
    return reject
        ? rej("Error")
        : setTimeout(function () {
            resolve(promiseData);
        }, 50);
});

const asyncMiddleware = (reject: boolean) => async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const data = await asyncRequest(reject);
    req.body = { data };
    next();
};

class AsyncMiddleware extends BaseMiddleware {

    constructor(private reject: boolean) {
        super();
    }

    public async handler(req: express.Request, res: express.Response, next: express.NextFunction): Promise<any> {
        if (this.reject) {
            throw new Error();
        }
        await asyncMiddleware(false)(req, res, next);
    }

}

const errorConfig = (app: express.Application) => {
    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
        if (err) {
            console.error(err);
            res.status(500).send("Something broke!");
        }
    });
};

const syncMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => next();

describe("Async Controllers and Middleware", () => {

    beforeEach((done) => {
        cleanUpMetadata();
        done();
    });

    describe("Promises in Middleware", () => {
        it("should execute async middleware and send req body", async () => {
            @controller("/foo", asyncMiddleware(false), asyncMiddleware(false))
            class FooController implements interfaces.Controller {
                @httpGet("/")
                private index(req: express.Request, res: express.Response, next: express.NextFunction) {
                    res.send(req.body);
                }
            }
            const container = new Container();
            const server = new InversifyExpressServer(container);
            server.setErrorConfig(errorConfig);

            await supertest(server.build())
                .get("/foo")
                .expect(200, { data: promiseData });
        });

        it("should execute async middleware class and send req body", async () => {
            @controller("/foo", AsyncMiddleware, AsyncMiddleware)
            class FooController implements interfaces.Controller {
                @httpGet("/")
                private index(req: express.Request, res: express.Response, next: express.NextFunction) {
                    res.send(req.body);
                }
            }
            const container = new Container();
            container.bind(AsyncMiddleware).toConstantValue(new AsyncMiddleware(false));
            const server = new InversifyExpressServer(container);
            server.setErrorConfig(errorConfig);

            await supertest(server.build())
                .get("/foo")
                .expect(200, { data: promiseData });

        });

        it("should execute async middleware class and catch exception thrown in middleware", async () => {
            @controller("/foo", AsyncMiddleware, AsyncMiddleware)
            class FooController implements interfaces.Controller {
                @httpGet("/")
                private index(req: express.Request, res: express.Response, next: express.NextFunction) {
                    res.send(req.body);
                }
            }
            const container = new Container();
            container.bind(AsyncMiddleware).toConstantValue(new AsyncMiddleware(true));
            const server = new InversifyExpressServer(container);
            server.setErrorConfig(errorConfig);

            await supertest(server.build())
                .get("/foo")
                .expect(500);

        });

        it("should catch rejection and call next to the error config middleware", async () => {
            @controller("/foo", asyncMiddleware(true), asyncMiddleware(true))
            class FooController implements interfaces.Controller {
                @httpGet("/")
                private index(req: express.Request, res: express.Response, next: express.NextFunction) {
                    res.send(req.body);
                }
            }
            const container = new Container();
            const server = new InversifyExpressServer(container);
            server.setErrorConfig(errorConfig);

            await supertest(server.build())
                .get("/foo")
                .expect(500, "Something broke!");
        });

        it("should not complain if controller does not return async value after async computation", async () => {
            @controller("/foo", asyncMiddleware(true), asyncMiddleware(true))
            class FooController implements interfaces.Controller {
                @httpGet("/")
                private async index(req: express.Request, res: express.Response, next: express.NextFunction) {
                    await asyncRequest(false);
                    res.send(req.body);
                }
            }
            const container = new Container();
            const server = new InversifyExpressServer(container);
            server.setErrorConfig(errorConfig);

            await supertest(server.build())
                .get("/foo")
                .expect(500, "Something broke!");
        });

        it("should catch error in error handler if async controller method promise is rejected", async () => {
            @controller("/foo", asyncMiddleware(false), asyncMiddleware(false))
            class FooController implements interfaces.Controller {
                @httpGet("/")
                private async index(req: express.Request, res: express.Response, next: express.NextFunction) {
                    await asyncRequest(true);
                    res.send(req.body);
                }
            }
            const container = new Container();
            const server = new InversifyExpressServer(container);
            server.setErrorConfig(errorConfig);

            await supertest(server.build())
                .get("/foo")
                .expect(500, "Something broke!");
        });
    });
    describe("Promises in Async Controllers", () => {
        it("should execute controller method async", async () => {
            @controller("/", asyncMiddleware(false), asyncMiddleware(false))
            class FooController implements interfaces.Controller {

                @httpGet("foo")
                private async index(req: express.Request, res: express.Response, next: express.NextFunction) {
                    await asyncRequest(false);
                    res.send(req.body);
                }

            }
            const container = new Container();
            const server = new InversifyExpressServer(container);
            server.setErrorConfig(errorConfig);

            await supertest(server.build())
                .get("/foo")
                .expect(200, { data: promiseData });
        });


        const throwingAsyncMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
            throw Error("Async Middleware error");
        };

        it("should execute and catch error thrown by middleware in controller method async", async () => {
            @controller("/", asyncMiddleware(false), throwingAsyncMiddleware, throwingAsyncMiddleware)
            class FooController implements interfaces.Controller {

                @httpGet("foo")
                private async index(req: express.Request, res: express.Response, next: express.NextFunction) {
                    await asyncRequest(false);
                    res.send(req.body);
                }

            }
            const container = new Container();
            const server = new InversifyExpressServer(container);
            server.setErrorConfig(errorConfig);

            await supertest(server.build())
                .get("/foo")
                .expect(500, "Something broke!");
        });
    });


});
