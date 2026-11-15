import './comments'
import { afterContent, api } from './main'

afterContent.forEach((hook) => hook())
api.postMessage({ type: 'ready' })
