var _ = require('lodash');
var expect = require('chai').expect;

var settings = require('../../settings_test');
var test_db = require('../test_db');
var user = require('../../lib/user');


describe('user', function() {
    var client = test_db.client(settings.REDIS_TEST_URL);
    var TEST_USER_EMAILS = ['test@test.com', 'test2@test.com', 'test3@test.com'];

    before(function(done) {
        client.on('ready', function() {
            client.flushdb(function() {
                done();
            });
        });
    });

    describe('add', function() {
        it('should have basic properties', function(done) {
            var test_user = user.newUser(client, TEST_USER_EMAILS[0]);
            expect(test_user).to.have.property('dateLastLogin');
            expect(test_user).to.have.property('email');
            expect(test_user).to.have.property('homepage');
            expect(test_user).to.have.property('id');

            expect(test_user).to.have.deep.property('permissions.developer', false);
            expect(test_user).to.have.deep.property('permissions.reviewer', false);
            expect(test_user).to.have.deep.property('permissions.admin', false);

            expect(test_user).to.have.property('support');
            expect(test_user).to.have.property('teamName');
            expect(test_user).to.have.property('teamSlug');
            expect(test_user).to.have.property('username');
            done();
        });
    });

    describe('get', function() {
        var TEST_USER;
        before(function(done) {
            TEST_USER = user.newUser(client, TEST_USER_EMAILS[0]);
            done();
        });

        it('should work by email', function(done) {
            user.getUserFromEmail(client, TEST_USER_EMAILS[0], function(error, test_user) {
                expect(error).to.not.exist;
                expect(test_user).to.be.eql(TEST_USER);
                done();
            });
        });

        it('should work by id', function(done) {
            user.getUserFromID(client, TEST_USER.id, function(error, test_user) {
                expect(error).to.not.exist;
                expect(test_user).to.be.eql(TEST_USER);
                done();
            });
        });

        it('should return id from email', function(done) {
            user.getUserIDFromEmail(client, TEST_USER_EMAILS[0], function(error, id) {
                expect(error).to.not.exist;
                expect(id).to.be.equal(TEST_USER.id);
                done();
            });
        });
    });

    describe('update', function() {
        function testUpdateSuccess(client, test_user, patch, done) {
            var updated_user = _.assign(_.cloneDeep(test_user), patch);

            user.updateUser(client, test_user.id, patch, function(error, db_user) {
                expect(error).to.not.exist;
                expect(db_user).to.have.property('dateLastModified');
                expect(_.omit(db_user, 'dateLastModified')).to.be.eql(updated_user);

                // Retrieve it again just to make sure that it works
                user.getUserFromEmail(client, updated_user.email, function(error, db_user) {
                    expect(error).to.not.exist;
                    expect(_.omit(db_user, 'dateLastModified')).to.be.eql(updated_user);
                    done();
                });
            });
        }

        var TEST_USER;
        beforeEach(function(done) {
            client.flushdb(function() {
                user.newUser(client, TEST_USER_EMAILS[0]);
                user.getUserFromEmail(client, TEST_USER_EMAILS[0], function(error, test_user) {
                    TEST_USER = test_user;
                    done();
                });
            });
        });

        describe('basic properties', function() {
            it('should work', function(done) {
                var patch = {homepage: 'http://www.newhomepage.com/'};
                testUpdateSuccess(client, TEST_USER, patch, done);
            });
        });

        describe('indexable properties', function() {
            it('should work for email', function(done) {
                var patch = {email: 'new_test@test.com'};
                testUpdateSuccess(client, TEST_USER, patch, function() {
                    // We should no longer have any user with the old email
                    user.getUserFromEmail(client, TEST_USER.email, function(error, db_user) {
                        expect(error).to.be.equal('no_such_user');
                        expect(db_user).to.not.exist;
                        done();
                    });
                });
            });

            it.skip('should not work for id', function(done) {
                var patch = {id: 'booya modified id woots'};
                user.updateUser(client, TEST_USER.id, patch, function(error, test_user) {
                    expect(error).to.exist
                    expect(test_user).to.not.have.property('dateLastModified');
                    expect(test_user).to.be.eql(TEST_USER);
                    done();
                });
            });
        });

        describe('permissions properties', function() {
            it('should work', function(done) {
                var permissions = TEST_USER.permissions;
                permissions.admin = true;
                var patch = {permissions: permissions};
                testUpdateSuccess(client, TEST_USER, patch, done);
            });
        });
    });

    describe('masked', function() {
        var TEST_USERS = [];
        before(function(done) {
            TEST_USERS = _.map(TEST_USER_EMAILS, function(email) {
                return user.newUser(client, email);
            })
            done();
        });

        it('should work for publicUserObj', function(done) {
            var publicUser = user.publicUserObj(TEST_USERS[0]);
            var publicKeys = ['avatar', 'username', 'id'];
            var userKeys = _.keys(publicUser);

            var difference = _.xor(publicKeys, userKeys);
            expect(difference).to.be.empty;
            done();
        });

        it('should work for publicDevObj', function(done) {
            var devUser = user.publicDevObj(TEST_USERS[0]);
            var publicKeys = ['avatar', 'companyName', 'homepage', 'support'];
            var userKeys = _.keys(devUser);

            var difference = _.xor(publicKeys, userKeys);
            expect(difference).to.be.empty;
            done();
        });

        it.skip('should work for getPublicUserObj', function(done) {
            var test_user = TEST_USERS[0];
            var public_user = user.publicUserObj(test_user);
            user.getPublicUserObj(client, test_user.id, function(error, db_user) {
                expect(error).to.not.exist;
                expect(db_user).to.be.eql(public_user);
                done();
            });
        });

        it.skip('should work for getPublicUserObjList', function(done) {
            var ids = [];
            var public_users = [];

            TEST_USERS.forEach(function(test_user) {
                ids.push(test_user.id);
                public_users.push(user.publicUserObj(test_user));
            });

            user.getPublicUserObjList(client, ids, function(error, db_users) {
                expect(error).to.not.exist;
                expect(db_users).to.be.eql(public_users);
                done();
            });
        });
    });
});
