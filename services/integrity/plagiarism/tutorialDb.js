/**
 * Known tutorial fingerprints for plagiarism detection.
 * Add more entries as you discover common submissions.
 * `code` field holds key structural tokens/patterns from the tutorial source.
 */

const tutorialFingerprints = [
  {
    name: 'React Todo App (official docs)',
    url: 'https://react.dev/learn/tutorial-tic-tac-toe',
    code: `useState todos setTodos addTodo deleteTodo toggleTodo TodoItem TodoList App handleSubmit handleDelete handleToggle className todo-list todo-item completed`
  },
  {
    name: 'Django Blog Tutorial',
    url: 'https://docs.djangoproject.com/en/stable/intro/tutorial01/',
    code: `models Post title body created_at updated_at views ListView DetailView CreateView UpdateView DeleteView get_absolute_url slug login_required urls path include admin register`
  },
  {
    name: 'Express REST API Tutorial (MDN)',
    url: 'https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs',
    code: `express Router app.get app.post app.put app.delete mongoose Schema model connect req res next middleware cors dotenv PORT listen`
  },
  {
    name: 'Node.js CRUD with MongoDB (freeCodeCamp)',
    url: 'https://www.freecodecamp.org/news/nodejs-mongodb-crud/',
    code: `mongoose connect Schema ObjectId findById findByIdAndUpdate findByIdAndDelete save express Router bodyParser`
  },
  {
    name: 'Flask Todo App',
    url: 'https://flask.palletsprojects.com/en/stable/tutorial/',
    code: `Flask render_template redirect url_for request db SQLAlchemy Todo title complete db.session.add db.session.commit db.session.delete app.route methods GET POST`
  },
  {
    name: 'React Weather App Tutorial',
    url: 'https://github.com/topics/react-weather-app',
    code: `useState useEffect fetch OpenWeatherMap api_key city weather temperature humidity description setWeather setLoading axios getWeather handleSearch`
  },
  {
    name: 'Vue.js Todo App',
    url: 'https://vuejs.org/guide/introduction',
    code: `createApp data methods computed v-model v-for v-if v-on todos addTodo removeTodo toggleTodo newTodo ref reactive`
  }
];

module.exports = { tutorialFingerprints };