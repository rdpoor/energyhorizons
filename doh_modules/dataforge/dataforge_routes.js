Doh.Module('dataforge_routes', 'express_router', function (Router) {
  Router.AddRoute('/dataforge/forge', async function (obj, req, res, callback) {
    if (obj) {
      let commands = obj.commands;
      let incomingData = obj.data;
      let adf = New('AsyncDataforge');
      let result = await adf.forge(incomingData, commands);
      Router.SendJSON(res, result, callback);
    }
    return false;
  });
  //console.log('Dataforge routes loaded.')
});