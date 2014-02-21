// TODO: Update prefill script to include featured
var _ = require('lodash');
var auth = require('../../lib/auth');
var db = require('../../db');
var libgenre = require('../../lib/genre');
var user = require('../../lib/user');


module.exports = function(server) {
    // Sample usage:
    // % curl 'http://localhost:5000/featured'
    server.get({
        url: '/featured',
        swagger: {
            nickname: 'featured',
            notes: 'Get the list of featured games',
            summary: 'List of featured games'
        },
        genre: {
            description: 'Genre',
            isRequired: false
        }
    }, db.redisView(function(client, done, req, res, wrap) {
        var DATA = req.params;

        var genre = DATA.genre;

        if (!genre) {
            client.hkeys('featured', db.plsNoError(res, done, function(games) {
                res.json(games);
                done();
                return;
            }));
        } else {
            libgenre.hasGenre(client, genre, db.plsNoError(res, done, function(exists) {
                if (!exists) {
                    res.json(400, {error: 'invalid_genre'});
                    done();
                    return;
                }
                client.smembers('featured:' + genre, db.plsNoError(res, done, function(games) {
                    res.json(games);
                    done();
                    return;
                }));
            }));
        }
    }));

    // Sample usage:
    // % curl -X POST 'http://localhost:5000/featured' -d '_user=ssa_token&game=game_slug&genres=["action"]'
    server.post({
        url: '/featured',
        swagger: {
            nickname: 'add-featured',
            notes: 'Add a new featured game',
            summary: 'Add a new featured game'
        },
        validation: {
            _user: {
                description: 'User',
                isRequired: true
            },
            game: {
                description: 'Game slug',
                isRequired: true
            },
            genres: {
                description: 'List of genres',
                isRequired: false
            }
        }
    }, db.redisView(function(client, done, req, res, wrap) {
        var DATA = req.params;

        // TODO: Use @aricha's plugin once it is merged to master
        var _user = DATA._user;
        var email = auth.verifySSA(_user);
        if (!email) {
            res.json(403, {error: 'bad_user'});
            done();
            return;
        }

        // TODO: Check for valid game.
        // https://github.com/cvan/galaxy-api/issues/57
        var game = DATA.game;
        if (!game) {
            res.json(400, {error: 'bad_game'});
            done();
            return;
        }

        var genres = DATA.genres;
        if (!genres) {
            genres = [];
        } else {
            try {
                genres = JSON.parse(genres);
                if (!(genres instanceof Array)) {
                    throw "bad_genres";
                }
            } catch (e) {
                res.json(400, {error: 'bad_genres'});
                done();
                return;
            }
        }

        function addFeatured(client, game, genres) {
            var multi = client.multi();
            multi.hset('featured', game, JSON.stringify(genres));

            _.each(genres, function(genre) {
                multi.sadd('featured:' + genre, game);
            });

            multi.exec(db.plsNoError(res, done, function() {
                res.json({success: true});
                done();
            }));
        }

        user.getUserFromEmail(client, email, db.plsNoError(res, done, function(authenticator) {
            if (!authenticator.permissions || (!authenticator.permissions.admin && !authenticator.permissions.reviewer)) {
                res.json(403, {error: 'bad_permission'});
                done();
                return;
            } 

            client.hexists('featured', game, db.plsNoError(res, done, function(reply) {
                if (reply === 1) {
                    res.json(400, {error: 'already_featured'});
                    done();
                    return;
                }

                libgenre.hasGenres(client, genres, db.plsNoError(res, done, function(exists) {
                    if (!exists) {
                        res.json(400, {error: 'invalid_genres'});
                        done();
                        return;
                    }
                    addFeatured(client, game, genres);
                }));
            }));
        }));
    }));

    // Sample usage:
    // % curl -X PUT 'http://localhost:5000/featured' -d '_user=ssa_token&game=game_slug&genres=["simulation"]'
    server.put({
        url: '/featured',
        swagger: {
            nickname: 'put-featured',
            notes: 'Edit an existing featured game',
            summary: 'Edit a featured game'
        },
        validation: {
            _user: {
                description: 'User',
                isRequired: true
            },
            game: {
                description: 'Game slug',
                isRequired: true
            },
            genres: {
                description: 'List of genres',
                isRequired: false
            }
        }
    }, db.redisView(function(client, done, req, res, wrap) {
        var DATA = req.params;

        // TODO: Use @aricha's plugin once it is merged to master
        var _user = DATA._user;
        var email = auth.verifySSA(_user);
        if (!email) {
            res.json(403, {error: 'bad_user'});
            done();
            return;
        }

        // TODO: Check for valid game.
        // https://github.com/cvan/galaxy-api/issues/57
        var game = DATA.game;
        if (!game) {
            res.json(400, {error: 'bad_game'});
            done();
            return;
        }

        var new_genres = DATA.genres;
        if (!new_genres) {
            new_genres = [];
        } else {
            try {
                new_genres = JSON.parse(new_genres);
                if (!(new_genres instanceof Array)) {
                    throw "bad_genres";
                }
            } catch (e) {
                res.json(400, {error: 'bad_genres'});
                done();
                return;
            }
        }

        function editFeatured(client, game, old_genres, new_genres) {
            var remove_genres = _.difference(old_genres, new_genres);
            var add_genres = _.difference(new_genres, old_genres);

            var multi = client.multi();
            multi.hset('featured', game, JSON.stringify(new_genres));

            _.each(remove_genres, function(genre) {
                multi.srem('featured:' + genre, game);
            });
            _.each(add_genres, function(genre) {
                multi.sadd('featured:' + genre, game);
            });

            multi.exec(db.plsNoError(res, done, function() {
                res.json({success: true});
                done();
            }));
        }

        user.getUserFromEmail(client, email, db.plsNoError(res, done, function(authenticator) {
            if (!authenticator.permissions || (!authenticator.permissions.admin && !authenticator.permissions.reviewer)) {
                res.json(403, {error: 'bad_permission'});
                done();
                return;
            } 

            client.hget('featured', game, db.plsNoError(res, done, function(genres) {
                if (!genres) {
                    res.json(400, {error: 'game_not_featured'});
                    done();
                    return;
                }
                libgenre.hasGenres(client, new_genres, function(error, exists) {
                    if (!exists) {
                        res.json(400, {error: 'invalid_genres'});
                        done();
                        return;
                    }
                    editFeatured(client, game, JSON.parse(genres), new_genres);
                });
            }));
        }));
    }));

    // Sample usage:
    // % curl -X DELETE 'http://localhost:5000/featured' -d '_user=ssa_token&game=game_slug'
    server.del({
        url: '/featured',
        swagger: {
            nickname: 'del-featured',
            notes: 'Delete an existing featured game',
            summary: 'Delete a featured game'
        },
        validation: {
            _user: {
                description: 'User',
                isRequired: true
            },
            game: {
                description: 'Game slug',
                isRequired: true
            }
        }
    }, db.redisView(function(client, done, req, res, wrap) {
        var DATA = req.params;

        // Check if the user have permission to add a featured game
        // TODO: Use @aricha's plugin once it is merged to master
        var _user = DATA._user;
        var email = auth.verifySSA(_user);
        if (!email) {
            res.json(403, {error: 'bad_user'});
            done();
            return;
        }

        // TODO: Check for valid game.
        // https://github.com/cvan/galaxy-api/issues/57
        var game = DATA.game;
        if (!game) {
            res.json(400, {error: 'bad_game'});
            done();
            return;
        }

        function removeFeatured(client, game, genres) {
            var multi = client.multi();
            multi.hdel('featured', game);

            _.each(genres, function(genre) {
                multi.srem('featured:' + genre, game);
            });

            multi.exec(db.plsNoError(res, done, function() {
                res.json({success: true});
                done();
            }));
        }

        user.getUserFromEmail(client, email, db.plsNoError(res, done, function(authenticator) {
            if (!authenticator.permissions || (!authenticator.permissions.admin && !authenticator.permissions.reviewer)) {
                res.json(403, {error: 'bad_permission'});
                done();
                return;
            } 

            client.hget('featured', game, db.plsNoError(res, done, function(genres) {
                if (!genres) {
                    res.json(400, {error: 'game_not_featured'});
                    done();
                    return;
                }
                removeFeatured(client, game, JSON.parse(genres));
            }));
        }));
    }));
}
