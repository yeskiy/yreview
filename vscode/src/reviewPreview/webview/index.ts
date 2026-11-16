import './comments'
import { afterContent, api } from './main'

afterContent.forEach((hook) => hook())
api.postMessage({
  type: 'ready',
  build: (JSON.parse(document.body.dataset.yreviewPreview ?? '{}') as { build?: number }).build,
})
