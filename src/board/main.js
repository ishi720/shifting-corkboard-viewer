import { mount } from 'svelte';
import '../app.css';
import '../lib/analytics.js';
import Board from './Board.svelte';

export default mount(Board, { target: document.getElementById('app') });
