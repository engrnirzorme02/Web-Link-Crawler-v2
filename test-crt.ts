import axios from 'axios';
async function test() {
  try {
     const crtShUrl = `https://crt.sh/?q=%25.mpghs.com&output=json`;
     const response = await axios.get(crtShUrl, { timeout: 15000 });
     console.log(response.data.slice(0, 2));
  } catch(e) {
     console.error(e.message);
  }
}
test();
