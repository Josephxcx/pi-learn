/* Practice stays local; terminal active recall remains the tutor's progression gate. */
(() => {
  document.querySelectorAll('[data-pi-steps]').forEach(group => {
    const steps = [...group.querySelectorAll('[data-pi-step]')];
    const previous = group.querySelector('[data-pi-prev]');
    const next = group.querySelector('[data-pi-next]');
    const status = group.querySelector('[data-pi-step-status]');
    let index = 0;
    const render = () => {
      steps.forEach((step,i) => {step.hidden = i !== index;});
      if(previous) previous.disabled = index === 0;
      if(next) next.disabled = index >= steps.length - 1;
      if(status) status.textContent = `Step ${index + 1} of ${steps.length}`;
    };
    if(!steps.length) return;
    previous?.addEventListener('click',()=>{index = Math.max(0,index-1);render();});
    next?.addEventListener('click',()=>{index = Math.min(steps.length-1,index+1);render();});
    render();
  });
  document.querySelectorAll('[data-pi-fraction]').forEach(group => {
    const slider = group.querySelector('input[type="range"]');
    const parts = [...group.querySelectorAll('[data-pi-part]')];
    const output = group.querySelector('[data-pi-fraction-value]');
    if(!slider || !parts.length) return;
    slider.min = '0';slider.max = String(parts.length);slider.step = '1';
    const render = () => {
      const count = Number(slider.value);
      parts.forEach((part,i)=>{part.setAttribute('fill',i<count?'var(--pi-cobalt)':'var(--pi-paper)');});
      if(output) output.textContent = `${count}/${parts.length} = ${Math.round(count/parts.length*100)}%`;
    };
    slider.addEventListener('input',render);render();
  });
  document.querySelectorAll('form[data-pi-quiz]').forEach(form => {
    const inputs = [...form.querySelectorAll('input[data-pi-answer]')];
    const feedback = form.querySelector('[data-pi-feedback]');
    const hint = form.querySelector('[data-pi-hint]');
    const retry = form.querySelector('[data-pi-retry]');
    inputs.forEach(input => input.addEventListener('change', () => {
      if(feedback) {feedback.hidden=true;feedback.textContent='';}
    }));
    form.addEventListener('submit',event=>{
      event.preventDefault();
      if(!feedback) return;
      feedback.hidden = false;
      if(!inputs.some(input=>input.checked)) {feedback.textContent='Choose an answer before submitting.';return;}
      const correct = inputs.every(input=>input.checked === (input.dataset.piAnswer === 'true'));
      const explanations = inputs.filter(input=>input.checked).map(input=>input.dataset.piExplanation || '').filter(Boolean);
      feedback.textContent = `${correct?'Correct.':'Not quite. Try again.'} ${explanations.join(' ')}`;
    });
    form.querySelector('[data-pi-show-hint]')?.addEventListener('click',()=>{if(hint) hint.hidden=!hint.hidden;});
    retry?.addEventListener('click',()=>{
      form.reset();if(feedback){feedback.hidden=true;feedback.textContent='';}if(hint) hint.hidden=true;
      inputs[0]?.focus();
    });
  });
  document.querySelectorAll('[data-pi-math]').forEach(element => {
    if(typeof katex !== 'undefined') {
      katex.render(element.textContent,element,{throwOnError:false,displayMode:element.dataset.piMath==='display'});
    }
  });
})();
